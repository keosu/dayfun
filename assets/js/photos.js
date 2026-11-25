// Keep photos small enough for local storage, backups and optional synchronization.
export async function compressPhoto(file) {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件。");
  if (file.size > 20 * 1024 * 1024)
    throw new Error("照片超过 20 MB，请选择较小的图片。");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error("无法读取这张图片，请使用 JPG、PNG 或 WebP。");
    });
    const scale = Math.min(
      1,
      1200 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.82;
    let result = canvas.toDataURL("image/jpeg", quality);
    while (result.length > 800000 && quality > 0.35) {
      quality -= 0.1;
      result = canvas.toDataURL("image/jpeg", quality);
    }
    if (result.length > 1500000)
      throw new Error("照片压缩后仍然过大，请选择较小的图片。");
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}
