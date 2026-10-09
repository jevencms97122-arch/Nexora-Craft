//! Détection d'un son déjà en cours sur le PC (musique, vidéo YouTube, appel...).
//!
//! Windows tient la liste des applications qui envoient du son vers les haut-parleurs, chacune avec
//! un indicateur de niveau. Le launcher ne s'intéresse qu'aux applications qui ne sont pas les
//! siennes : lui-même, son navigateur intégré et le jeu qu'il a lancé sont tous des processus
//! descendants du launcher, et sont écartés. Sans cela, la musique d'ambiance se prendrait pour un
//! autre média et se couperait elle-même.

/// Vrai si une autre application joue du son en ce moment. En cas de doute (erreur de Windows),
/// retourne faux : la musique d'ambiance reste permise.
#[cfg(windows)]
pub fn other_media_playing() -> bool {
    imp::other_media_playing()
}

#[cfg(not(windows))]
pub fn other_media_playing() -> bool {
    false
}

/// Numéros des processus étrangers au launcher qui envoient du son (pour les essais).
#[cfg(windows)]
#[cfg(test)]
pub fn audible_processes() -> Vec<u32> {
    imp::audible_processes(false)
}

#[cfg(windows)]
mod imp {
    use std::collections::{HashMap, HashSet};
    use std::time::Duration;

    use windows::core::{Interface, Result};
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::Media::Audio::Endpoints::IAudioMeterInformation;
    use windows::Win32::Media::Audio::{
        eRender, AudioSessionStateActive, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator,
        MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED};
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };

    /// En dessous de ce niveau (de 0 à 1), on considère que c'est du silence.
    const AUDIBLE: f32 = 0.0005;
    /// Un morceau a des silences : le niveau est relevé plusieurs fois à quelques instants d'écart.
    const SAMPLES: usize = 4;
    const SAMPLE_GAP: Duration = Duration::from_millis(60);

    pub fn other_media_playing() -> bool {
        !audible_processes(true).is_empty()
    }

    /// Numéros des processus étrangers au launcher qui envoient du son. Avec `first_only`, s'arrête
    /// dès le premier trouvé.
    pub fn audible_processes(first_only: bool) -> Vec<u32> {
        unsafe {
            let initialized = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
            let found = sample(first_only).unwrap_or_default();
            if initialized {
                CoUninitialize();
            }
            found
        }
    }

    fn sample(first_only: bool) -> Result<Vec<u32>> {
        let own = own_process_tree();
        // Les interfaces COM sont toutes libérées en sortant d'ici, avant `CoUninitialize`.
        let meters = unsafe { active_meters(&own)? };
        let mut found: Vec<u32> = Vec::new();
        for round in 0..SAMPLES {
            if round > 0 {
                std::thread::sleep(SAMPLE_GAP);
            }
            for (pid, meter) in &meters {
                if unsafe { meter.GetPeakValue() }.unwrap_or(0.0) > AUDIBLE && !found.contains(pid) {
                    found.push(*pid);
                }
            }
            if first_only && !found.is_empty() {
                break;
            }
        }
        Ok(found)
    }

    /// Indicateurs de niveau des applications actives sur toutes les sorties audio, sauf celles
    /// du launcher et le son système de Windows.
    unsafe fn active_meters(own: &HashSet<u32>) -> Result<Vec<(u32, IAudioMeterInformation)>> {
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let devices = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
        let mut meters = Vec::new();
        for d in 0..devices.GetCount()? {
            let Ok(device) = devices.Item(d) else { continue };
            let Ok(manager) = device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) else { continue };
            let Ok(sessions) = manager.GetSessionEnumerator() else { continue };
            for i in 0..sessions.GetCount()? {
                let Ok(control) = sessions.GetSession(i) else { continue };
                let Ok(details) = control.cast::<IAudioSessionControl2>() else { continue };
                // S_OK (0) : c'est la session des sons système (notifications, clics).
                if details.IsSystemSoundsSession().0 == 0 {
                    continue;
                }
                if control.GetState().ok() != Some(AudioSessionStateActive) {
                    continue;
                }
                let pid = details.GetProcessId().unwrap_or(0);
                if pid == 0 || own.contains(&pid) {
                    continue;
                }
                if let Ok(meter) = control.cast::<IAudioMeterInformation>() {
                    meters.push((pid, meter));
                }
            }
        }
        Ok(meters)
    }

    /// Le launcher et tous les processus qui en descendent (navigateur intégré, jeu).
    fn own_process_tree() -> HashSet<u32> {
        let own = std::process::id();
        let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
        unsafe {
            if let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
                let mut entry = PROCESSENTRY32W {
                    dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                    ..Default::default()
                };
                if Process32FirstW(snapshot, &mut entry).is_ok() {
                    loop {
                        children.entry(entry.th32ParentProcessID).or_default().push(entry.th32ProcessID);
                        if Process32NextW(snapshot, &mut entry).is_err() {
                            break;
                        }
                    }
                }
                let _ = CloseHandle(snapshot);
            }
        }

        let mut tree = HashSet::from([own]);
        let mut queue = vec![own];
        while let Some(pid) = queue.pop() {
            for &child in children.get(&pid).into_iter().flatten() {
                if tree.insert(child) {
                    queue.push(child);
                }
            }
        }
        tree
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    /// Un son produit par un processus lancé par le launcher (le jeu, par exemple) ne compte pas.
    /// `NEXORA_TONE=<fichier.wav> cargo test ignores_own_children -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn ignores_own_children() {
        let tone = std::env::var("NEXORA_TONE").expect("NEXORA_TONE");
        let mut child = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-Command", &format!("(New-Object Media.SoundPlayer '{tone}').PlaySync()")])
            .spawn()
            .expect("lecteur de son");
        std::thread::sleep(std::time::Duration::from_secs(3));
        let heard = audible_processes();
        let _ = child.kill();
        println!("processus enfant : {} ; sons détectés venant de : {heard:?}", child.id());
        assert!(!heard.contains(&child.id()), "le son d'un processus enfant a été pris pour un autre média");
    }

    /// À lancer à la main pendant qu'un son joue depuis une autre application :
    /// `cargo test detects_other_media -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn detects_other_media() {
        let expected = std::env::var("NEXORA_EXPECT_MEDIA").ok();
        let mut seen = false;
        for _ in 0..6 {
            seen = other_media_playing();
            println!("autre média en cours : {seen}");
            for pid in audible_processes() {
                println!("  son venant du processus {pid}");
            }
            if seen {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(400));
        }
        match expected.as_deref() {
            Some("yes") => assert!(seen, "le son de l'autre application n'a pas été détecté"),
            Some("no") => assert!(!seen, "un autre média a été détecté alors qu'aucun ne devrait jouer"),
            _ => {}
        }
    }
}
