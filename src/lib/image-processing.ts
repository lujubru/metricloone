import sharp from "sharp";
import { instagramFeedCrop } from "./media";

/** Lado máximo al que se reescalan las imágenes antes de guardarlas. */
export const MAX_IMAGE_DIMENSION = 2048;

/** Orientaciones EXIF 5 a 8 intercambian ancho y alto al rotar. */
function swapsSides(orientation?: number | null) {
  return !!orientation && orientation >= 5 && orientation <= 8;
}

/**
 * Deja una imagen lista para el feed de Instagram: JPEG, sin canal alfa y con
 * una relación de aspecto soportada (entre 4:5 y 1.91:1). Fuera de ese rango
 * Instagram rechaza el contenedor con «The aspect ratio is not supported».
 *
 * Devuelve el buffer original sin re-codificar si ya cumple el rango, así las
 * imágenes que ya estaban bien no pierden calidad ni se recargan de nuevo.
 */
export async function fitImageForInstagramFeed(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const width = swapsSides(meta.orientation) ? meta.height : meta.width;
  const height = swapsSides(meta.orientation) ? meta.width : meta.height;
  const crop = instagramFeedCrop(width, height);

  if (!crop) return input;

  return sharp(input)
    // La orientación EXIF se aplica primero, así que el recorte usa las
    // coordenadas de la imagen ya rotada.
    .autoOrient()
    .extract(crop)
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
