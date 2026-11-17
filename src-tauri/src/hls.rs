//! Lecture des playlists HLS renvoyées par Jellyfin (fonctions pures, testées).

use url::Url;

/// Playlist média : segment d'initialisation fMP4 (`#EXT-X-MAP`) et segments, dans l'ordre.
#[derive(Debug, PartialEq)]
pub struct MediaPlaylist {
    pub init: Option<Url>,
    pub segments: Vec<Url>,
}

/// Renvoie l'URL de la première variante d'une playlist maître, ou `None`
/// si le contenu est déjà une playlist média.
pub fn first_variant(body: &str, base: &Url) -> Result<Option<Url>, String> {
    if !body.contains("#EXT-X-STREAM-INF") {
        return Ok(None);
    }
    let mut after_stream_inf = false;
    for line in body.lines().map(str::trim) {
        if line.starts_with("#EXT-X-STREAM-INF") {
            after_stream_inf = true;
        } else if after_stream_inf && !line.is_empty() && !line.starts_with('#') {
            return base.join(line).map(Some).map_err(|e| e.to_string());
        }
    }
    Err("playlist maître sans variante".into())
}

pub fn parse_media(body: &str, base: &Url) -> Result<MediaPlaylist, String> {
    if !body.trim_start().starts_with("#EXTM3U") {
        return Err("réponse qui n'est pas une playlist HLS".into());
    }
    let mut init = None;
    let mut segments = Vec::new();

    for line in body.lines().map(str::trim) {
        if let Some(attrs) = line.strip_prefix("#EXT-X-MAP:") {
            let uri = attribute(attrs, "URI").ok_or("EXT-X-MAP sans URI")?;
            init = Some(base.join(&uri).map_err(|e| e.to_string())?);
        } else if !line.is_empty() && !line.starts_with('#') {
            segments.push(base.join(line).map_err(|e| e.to_string())?);
        }
    }

    if segments.is_empty() {
        return Err("playlist sans segment".into());
    }
    Ok(MediaPlaylist { init, segments })
}

/// Lit un attribut `NOM="valeur"` ou `NOM=valeur` d'une ligne de tag HLS.
fn attribute(attrs: &str, name: &str) -> Option<String> {
    let prefix = format!("{name}=");
    let start = attrs.find(&prefix)? + prefix.len();
    let rest = &attrs[start..];
    if let Some(quoted) = rest.strip_prefix('"') {
        quoted.split('"').next().map(str::to_string)
    } else {
        rest.split(',').next().map(str::to_string)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> Url {
        Url::parse("https://srv.example/videos/abc/master.m3u8?ApiKey=k").unwrap()
    }

    #[test]
    fn variante_relative_resolue() {
        let master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=8000000\nmain.m3u8?x=1\n";
        let url = first_variant(master, &base()).unwrap().unwrap();
        assert_eq!(url.as_str(), "https://srv.example/videos/abc/main.m3u8?x=1");
    }

    #[test]
    fn playlist_media_n_est_pas_maitre() {
        assert_eq!(
            first_variant("#EXTM3U\n#EXTINF:6,\n0.mp4\n", &base()).unwrap(),
            None
        );
    }

    #[test]
    fn segments_et_init_dans_l_ordre() {
        let media = "#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-MAP:URI=\"hls1/main/-1.mp4?a=1\"\n\
                     #EXTINF:6.0,\nhls1/main/0.mp4?a=1\n#EXTINF:6.0,\nhls1/main/1.mp4?a=1\n#EXT-X-ENDLIST\n";
        let p = parse_media(media, &base()).unwrap();
        assert_eq!(p.init.unwrap().path(), "/videos/abc/hls1/main/-1.mp4");
        assert_eq!(p.segments.len(), 2);
        assert_eq!(p.segments[1].path(), "/videos/abc/hls1/main/1.mp4");
    }

    #[test]
    fn rejette_une_reponse_non_hls() {
        assert!(parse_media("<html>", &base()).is_err());
        assert!(parse_media("#EXTM3U\n#EXT-X-ENDLIST\n", &base()).is_err());
    }
}
