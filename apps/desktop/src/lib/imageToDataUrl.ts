/**
 * Reads an image file, center-crops it to a square, and downsizes it to
 * `size`x`size`, returning a JPEG data URI. Keeps the payload small and
 * predictable regardless of the source image's dimensions — these are
 * stored as plain base64 text on the project record (see packages/types'
 * ProjectRecord.image/orgImage), not uploaded anywhere, so shrinking
 * client-side is what keeps that field small.
 */
export function resizeImageToDataUrl(file: File, size = 256, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to decode image"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }
        // Cover-crop: scale so the shorter side fills `size`, then center the longer side.
        const scale = size / Math.min(img.width, img.height);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;
        ctx.drawImage(img, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
