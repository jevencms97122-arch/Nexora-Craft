//! Informations sur le PC.

/// Mémoire vive totale de l'ordinateur, en Mo. `None` si elle n'a pas pu être lue.
#[cfg(windows)]
pub fn total_memory_mb() -> Option<u64> {
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

    let mut status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    // SAFETY: `status` est initialisée avec sa taille, comme l'exige l'API.
    unsafe { GlobalMemoryStatusEx(&mut status).ok()? };
    Some(status.ullTotalPhys / 1024 / 1024)
}

#[cfg(not(windows))]
pub fn total_memory_mb() -> Option<u64> {
    None
}
