//! Côté natif de Boune : accès Win32 (souris globale, fenêtre active,
//! minimiser une fenêtre) et icône dans la barre système.

use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter,
};

/// Infos sur la fenêtre actuellement au premier plan.
#[derive(Serialize)]
pub struct ForegroundInfo {
    pub hwnd: isize,
    pub title: String,
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

#[cfg(windows)]
mod native {
    use super::ForegroundInfo;
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowRect, GetWindowTextW, IsIconic, IsWindow, ShowWindow,
        SW_MINIMIZE,
    };

    pub fn foreground() -> Option<ForegroundInfo> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return None;
            }
            let mut buf = [0u16; 512];
            let len = GetWindowTextW(hwnd, &mut buf).max(0) as usize;
            let title = String::from_utf16_lossy(&buf[..len]);
            let mut rect = RECT::default();
            GetWindowRect(hwnd, &mut rect).ok()?;
            Some(ForegroundInfo {
                hwnd: hwnd.0 as isize,
                title,
                x: rect.left,
                y: rect.top,
                w: rect.right - rect.left,
                h: rect.bottom - rect.top,
            })
        }
    }

    /// Minimise (réversible : l'utilisateur peut la rouvrir depuis la barre des tâches).
    pub fn minimize(h: isize) -> bool {
        unsafe {
            let hwnd = HWND(h as *mut _);
            if !IsWindow(Some(hwnd)).as_bool() || IsIconic(hwnd).as_bool() {
                return false;
            }
            let _ = ShowWindow(hwnd, SW_MINIMIZE);
            true
        }
    }
}

#[cfg(not(windows))]
mod native {
    use super::ForegroundInfo;
    pub fn foreground() -> Option<ForegroundInfo> {
        None
    }
    pub fn minimize(_h: isize) -> bool {
        false
    }
}

#[tauri::command]
fn cursor_pos(app: AppHandle) -> Option<(f64, f64)> {
    app.cursor_position().ok().map(|p| (p.x, p.y))
}

#[tauri::command]
fn foreground_info() -> Option<ForegroundInfo> {
    native::foreground()
}

#[tauri::command]
fn minimize_window(hwnd: isize) -> bool {
    native::minimize(hwnd)
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let stats = MenuItem::with_id(app, "stats", "Voir les stats", true, None::<&str>)?;
    let sleep = MenuItem::with_id(app, "sleep", "Dodo / Réveil", true, None::<&str>)?;
    let home = MenuItem::with_id(app, "home", "Ramener Boune ici", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&stats, &sleep, &home, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Boune 🐰")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            other => {
                let _ = app.emit("tray", other.to_string());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            cursor_pos,
            foreground_info,
            minimize_window
        ])
        .setup(|app| {
            build_tray(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Boune");
}
