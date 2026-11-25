"""Fetch the two photographs not exposed through Wikipedia's pageimage API."""
import io
import json
import pathlib
import re
import urllib.parse
import urllib.request
from PIL import Image

destination = pathlib.Path(__file__).resolve().parents[1] / 'public' / 'images'
files = {'stinky-fish':'Fermented mandarin fish.jpg', 'li-tofu':'Li Hongzhang Hotchpotch.jpg'}
params = {'action':'query','titles':'|'.join('File:'+name for name in files.values()),'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':700,'format':'json'}
headers = {'User-Agent':'LittleDayRecipeCollection/1.0 (educational recipe application)'}
url = 'https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(params)
with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=30) as response:
    data = json.load(response)
pages = {page['title'].replace('File:',''):page for page in data['query']['pages'].values()}
credits = json.loads((destination / 'credits.json').read_text(encoding='utf-8'))
for slug,filename in files.items():
    info = pages[filename]['imageinfo'][0]
    with urllib.request.urlopen(urllib.request.Request(info.get('thumburl',info['url']),headers=headers),timeout=30) as response:
        picture = Image.open(io.BytesIO(response.read())).convert('RGB')
    picture.thumbnail((800,800))
    picture.save(destination / (slug+'.jpg'),quality=83,optimize=True)
    metadata = info['extmetadata']
    credit = next(item for item in credits if item['id'] == slug)
    credit.pop('error',None)
    credit.update({'file':'/images/'+slug+'.jpg','source':info['descriptionurl'],'author':re.sub('<[^>]+>','',metadata.get('Artist',{}).get('value','')),'license':metadata.get('LicenseShortName',{}).get('value',''),'licenseUrl':metadata.get('LicenseUrl',{}).get('value','')})
    print(slug+': downloaded')
(destination / 'credits.json').write_text(json.dumps(credits,ensure_ascii=False,indent=2),encoding='utf-8')
