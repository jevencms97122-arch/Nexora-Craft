//! Modèle de bras d'un skin (larges « classic » 4 px, ou fins « slim » 3 px) et conversion
//! d'un modèle à l'autre.
//!
//! Un skin bras fins affiché sur le modèle bras larges laisse voir une colonne vide (transparente,
//! on voit l'intérieur du bras) et des bandes noires sur le dessus des bras. Comme Minecraft choisit
//! le modèle du skin par défaut d'après l'UUID du compte, le pack hors-ligne fournit le skin dans
//! les deux modèles, bras convertis, pour qu'il s'affiche toujours correctement.

/// Image RGBA 8 bits.
pub struct Rgba {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
}

impl Rgba {
    fn idx(&self, x: u32, y: u32) -> usize {
        ((y * self.width + x) * 4) as usize
    }

    fn alpha(&self, x: u32, y: u32) -> u8 {
        self.data[self.idx(x, y) + 3]
    }
}

/// Décode un PNG (palette, gris, RGB ou RGBA) en RGBA 8 bits.
pub fn decode(bytes: &[u8]) -> Option<Rgba> {
    let mut decoder = png::Decoder::new(bytes);
    decoder.set_transformations(png::Transformations::normalize_to_color8());
    let mut reader = decoder.read_info().ok()?;
    let mut buf = vec![0; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).ok()?;
    let (width, height) = (info.width, info.height);
    let pixels = (width * height) as usize;
    let data = match info.color_type {
        png::ColorType::Rgba => buf[..pixels * 4].to_vec(),
        png::ColorType::Rgb => buf[..pixels * 3].chunks(3).flat_map(|p| [p[0], p[1], p[2], 255]).collect(),
        png::ColorType::GrayscaleAlpha => buf[..pixels * 2].chunks(2).flat_map(|p| [p[0], p[0], p[0], p[1]]).collect(),
        png::ColorType::Grayscale => buf[..pixels].iter().flat_map(|&g| [g, g, g, 255]).collect(),
        png::ColorType::Indexed => return None,
    };
    Some(Rgba { width, height, data })
}

pub fn encode(image: &Rgba) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, image.width, image.height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().ok()?;
        writer.write_image_data(&image.data).ok()?;
    }
    Some(out)
}

/// Un skin 64x64 est « bras fins » si la colonne que seul le modèle bras larges utilise (arrière
/// du bras droit, x 54-55, y 20-31) est entièrement transparente.
pub fn is_slim(image: &Rgba) -> bool {
    if image.width != 64 || image.height != 64 {
        return false;
    }
    (54..56).all(|x| (20..32).all(|y| image.alpha(x, y) == 0))
}

/// Coins haut-gauche des quatre zones de bras d'un skin 64x64 (bras droit et gauche, couche de
/// base et 2ᵉ couche). Chaque zone fait 16x16 : 4 px de haut pour le dessus et le dessous, puis
/// 12 px pour les côtés.
const ARM_AREAS: [(u32, u32); 4] = [(40, 16), (40, 32), (32, 48), (48, 48)];

/// Une face à recopier : x de départ dans la source et la destination, et pour chaque colonne de
/// la destination, la colonne source correspondante.
struct Face {
    src_x: u32,
    dst_x: u32,
    columns: &'static [u32],
    top: bool,
}

/// Bras fins (3 px) vers bras larges (4 px) : la colonne du milieu des faces larges est doublée.
const SLIM_TO_WIDE: [Face; 6] = [
    Face { src_x: 4, dst_x: 4, columns: &[0, 1, 1, 2], top: true },  // dessus
    Face { src_x: 7, dst_x: 8, columns: &[0, 1, 1, 2], top: true },  // dessous
    Face { src_x: 0, dst_x: 0, columns: &[0, 1, 2, 3], top: false }, // côté extérieur
    Face { src_x: 4, dst_x: 4, columns: &[0, 1, 1, 2], top: false }, // devant
    Face { src_x: 7, dst_x: 8, columns: &[0, 1, 2, 3], top: false }, // côté intérieur
    Face { src_x: 11, dst_x: 12, columns: &[0, 1, 1, 2], top: false }, // dos
];

/// Bras larges (4 px) vers bras fins (3 px) : une colonne du milieu des faces larges est retirée.
const WIDE_TO_SLIM: [Face; 6] = [
    Face { src_x: 4, dst_x: 4, columns: &[0, 1, 3], top: true },
    Face { src_x: 8, dst_x: 7, columns: &[0, 1, 3], top: true },
    Face { src_x: 0, dst_x: 0, columns: &[0, 1, 2, 3], top: false },
    Face { src_x: 4, dst_x: 4, columns: &[0, 1, 3], top: false },
    Face { src_x: 8, dst_x: 7, columns: &[0, 1, 2, 3], top: false },
    Face { src_x: 12, dst_x: 11, columns: &[0, 1, 3], top: false },
];

/// Convertit les bras d'un skin 64x64 vers l'autre modèle (le reste du skin ne change pas).
pub fn convert_arms(image: &Rgba, to_slim: bool) -> Rgba {
    let faces = if to_slim { &WIDE_TO_SLIM } else { &SLIM_TO_WIDE };
    let mut out = Rgba { width: image.width, height: image.height, data: image.data.clone() };
    for (ax, ay) in ARM_AREAS {
        // Zone du bras vidée (sauf les 4 px de gauche du dessus, inutilisés) puis recomposée.
        for y in ay..ay + 16 {
            for x in ax..ax + 16 {
                if y >= ay + 4 || x >= ax + 4 {
                    let i = out.idx(x, y);
                    out.data[i..i + 4].copy_from_slice(&[0, 0, 0, 0]);
                }
            }
        }
        for face in faces {
            let (y0, rows) = if face.top { (ay, 4) } else { (ay + 4, 12) };
            for row in 0..rows {
                for (dx, &sx) in face.columns.iter().enumerate() {
                    let src = image.idx(ax + face.src_x + sx, y0 + row);
                    let dst = out.idx(ax + face.dst_x + dx as u32, y0 + row);
                    out.data[dst..dst + 4].copy_from_slice(&image.data[src..src + 4]);
                }
            }
        }
    }
    out
}

/// Le skin dans les deux modèles : (bras larges, bras fins). Un skin illisible ou au vieux format
/// 64x32 est rendu tel quel pour les deux.
pub fn both_models(bytes: &[u8]) -> (Vec<u8>, Vec<u8>) {
    let Some(image) = decode(bytes).filter(|i| i.width == 64 && i.height == 64) else {
        return (bytes.to_vec(), bytes.to_vec());
    };
    if is_slim(&image) {
        let wide = encode(&convert_arms(&image, false)).unwrap_or_else(|| bytes.to_vec());
        (wide, bytes.to_vec())
    } else {
        let slim = encode(&convert_arms(&image, true)).unwrap_or_else(|| bytes.to_vec());
        (bytes.to_vec(), slim)
    }
}

/// Modèle à utiliser : un skin dont les bras sont visiblement fins est toujours appliqué en bras
/// fins (sinon il s'affiche troué), quel que soit le choix fait dans l'interface.
pub fn effective_variant(bytes: &[u8], requested: &str) -> &'static str {
    match decode(bytes) {
        Some(image) if is_slim(&image) => "slim",
        _ if requested == "slim" => "slim",
        _ => "classic",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn blank() -> Rgba {
        Rgba { width: 64, height: 64, data: vec![0; 64 * 64 * 4] }
    }

    fn paint(img: &mut Rgba, x: u32, y: u32, v: u8) {
        let i = img.idx(x, y);
        img.data[i..i + 4].copy_from_slice(&[v, v, v, 255]);
    }

    /// Skin bras fins : toutes les faces des quatre zones de bras remplies selon le modèle 3 px.
    fn slim_skin() -> Rgba {
        let mut img = blank();
        for (ax, ay) in ARM_AREAS {
            for y in ay..ay + 4 {
                for x in ax + 4..ax + 10 {
                    paint(&mut img, x, y, 100);
                }
            }
            for y in ay + 4..ay + 16 {
                for x in ax..ax + 14 {
                    paint(&mut img, x, y, (x - ax) as u8 + 1);
                }
            }
        }
        img
    }

    #[test]
    fn detects_slim_and_wide() {
        let slim = slim_skin();
        assert!(is_slim(&slim));
        assert!(!is_slim(&convert_arms(&slim, false)));
    }

    #[test]
    fn slim_to_wide_fills_the_whole_wide_arm() {
        let wide = convert_arms(&slim_skin(), false);
        for (ax, ay) in ARM_AREAS {
            for y in ay + 4..ay + 16 {
                for x in ax..ax + 16 {
                    assert_eq!(wide.alpha(x, y), 255, "trou au pixel {x},{y}");
                }
            }
            for y in ay..ay + 4 {
                for x in ax + 4..ax + 12 {
                    assert_eq!(wide.alpha(x, y), 255, "dessus/dessous troué au pixel {x},{y}");
                }
            }
        }
    }

    #[test]
    fn round_trip_keeps_slim_skin() {
        let slim = slim_skin();
        let back = convert_arms(&convert_arms(&slim, false), true);
        assert!(back.data == slim.data, "slim -> large -> slim doit redonner le skin d'origine");
    }

    #[test]
    fn png_round_trip() {
        let slim = slim_skin();
        let bytes = encode(&slim).unwrap();
        let decoded = decode(&bytes).unwrap();
        assert!(decoded.data == slim.data);
        assert_eq!(effective_variant(&bytes, "classic"), "slim");
    }
}
