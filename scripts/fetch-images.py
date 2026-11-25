"""Download Wikimedia recipe photographs and retain source / license metadata."""
import json
import pathlib
import re
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'public' / 'images'
DEST.mkdir(parents=True, exist_ok=True)
HEADERS = {'User-Agent': 'LittleDayRecipeCollection/1.0 (educational recipe application)'}
DISHES = {
    'tomato-egg': ('Stir-fried tomato and scrambled eggs', '番茄炒蛋'),
    'mapo-tofu': ('Mapo tofu', '麻婆豆腐'),
    'kung-pao': ('Kung Pao chicken', '宫保鸡丁'),
    'sweet-sour': ('Sweet and sour pork', '咕噜肉'),
    'white-chicken': ('White cut chicken', '白切鸡'),
    'dongpo': ('Dongpo pork', '东坡肉'),
    'longjing': ('Longjing shrimp', '龙井虾仁'),
    'pepper-fish': ('Duo jiao yu', '剁椒鱼头'),
    'braised-pork': ('Red braised pork belly', '红烧肉'),
    'lion-head': ("Lion's Head (food)", '狮子头'),
    'fried-rice': ('Yangzhou fried rice', '扬州炒饭'),
    'sweet-carp': ('Sweet and sour fish', '糖醋鲤鱼'),
    'scallion-cucumber': ('Sea cucumber as food', '葱烧海参'),
    'buddha-soup': ('Buddha Jumps Over the Wall', '佛跳墙'),
    'oyster-omelette': ('Oyster omelette', '海蛎煎'),
    'stinky-fish': ('Chou gui yu', '徽州臭鳜鱼'),
    'li-tofu': ('Li Hongzhang hotchpotch', '李鸿章大杂烩'),
    'peking-duck': ('Peking duck', '北京烤鸭'),
    'xiaolongbao': ('Xiaolongbao', '小笼包'),
    'beef-noodles': ('Lanzhou beef noodle soup', '兰州牛肉面'),
    'roujiamo': ('Roujiamo', '肉夹馍'),
    'hotpot': ('Hot pot', '火锅'),
    'dumplings': ('Jiaozi', '饺子'),
    'eggplant': ('Yuxiang', '鱼香茄子'),
}

def api(host, params):
    url = 'https://' + host + '/w/api.php?' + urllib.parse.urlencode(dict(params, format='json'))
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=35) as response:
        return json.load(response)

def clean(value):
    return re.sub('<[^>]+>', '', value or '').strip()

def batch_fetch():
    # A single query per wiki avoids Wikimedia's per-client request rate limit.
    english = api('en.wikipedia.org', {'action':'query','titles':'|'.join(item[0] for item in DISHES.values()),'redirects':1,'prop':'pageimages','pithumbsize':700})
    pages = {page['title'].lower():page for page in english['query']['pages'].values()}
    redirects = {item['from'].lower():item['to'].lower() for item in english['query'].get('redirects',[])}
    normalized = {item['from'].lower():item['to'].lower() for item in english['query'].get('normalized',[])}
    chosen = {}
    missing = []
    for slug,(title,chinese) in DISHES.items():
        key = title.lower()
        key = normalized.get(key,key)
        key = redirects.get(key,key)
        page = pages.get(key,{})
        if page.get('pageimage'):
            chosen[slug] = page['pageimage']
        else:
            missing.append(chinese)
    if missing:
        chinese_result = api('zh.wikipedia.org', {'action':'query','titles':'|'.join(missing),'redirects':1,'prop':'pageimages','pithumbsize':700})
        chinese_pages = {page['title']:page for page in chinese_result['query']['pages'].values()}
        for slug,(_,chinese) in DISHES.items():
            if slug not in chosen and chinese_pages.get(chinese,{}).get('pageimage'):
                chosen[slug] = chinese_pages[chinese]['pageimage']
    print('Photos found: '+str(len(chosen)),flush=True)
    metadata_result = api('commons.wikimedia.org', {'action':'query','titles':'|'.join('File:'+name for name in chosen.values()),'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':700})
    metadata_pages = {page['title'].replace('File:','').replace('_',' '):page for page in metadata_result['query']['pages'].values()}
    old = {item['id']:item for item in json.loads((DEST / 'credits.json').read_text(encoding='utf-8'))} if (DEST / 'credits.json').exists() else {}
    result = []
    for slug,(_,chinese) in DISHES.items():
        filename = chosen.get(slug,'').replace('_',' ')
        page = metadata_pages.get(filename,{})
        info = page.get('imageinfo',[{}])[0]
        if not info:
            result.append(old.get(slug,{'id':slug,'dish':chinese,'error':'No photograph found'}))
            continue
        meta = info.get('extmetadata',{})
        credit = {'id':slug,'dish':chinese,'file':'/images/'+slug+'.jpg','source':info['descriptionurl'],'author':clean(meta.get('Artist',{}).get('value')),'license':clean(meta.get('LicenseShortName',{}).get('value')),'licenseUrl':meta.get('LicenseUrl',{}).get('value','')}
        if not (DEST / (slug+'.jpg')).exists():
            try:
                url = info.get('thumburl',info['url'])
                with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=45) as response:
                    data = response.read()
                from PIL import Image
                import io
                image = Image.open(io.BytesIO(data)).convert('RGB')
                image.thumbnail((800,800))
                image.save(DEST / (slug+'.jpg'),quality=83,optimize=True)
                print(slug+': downloaded',flush=True)
            except Exception as error:
                credit['error'] = str(error)
                print(slug+': '+str(error),flush=True)
        result.append(credit)
    return result

credits = batch_fetch()
(DEST / 'credits.json').write_text(json.dumps(credits, ensure_ascii=False, indent=2), encoding='utf-8')
home = DEST / 'kung-pao.jpg'
if home.exists():
    (DEST / 'home-food.jpg').write_bytes(home.read_bytes())
