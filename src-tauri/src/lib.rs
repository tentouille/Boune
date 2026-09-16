//! Côté natif de Boune : accès Win32 (souris globale, fenêtre active,
//! minimiser une fenêtre) et icône dans la barre système.

use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

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
fn quit(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn minimize_window(hwnd: isize) -> bool {
    native::minimize(hwnd)
}

/// Affiche la fenêtre de réglages (déclarée cachée dans tauri.conf.json).
#[tauri::command]
fn open_settings(app: AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.center();
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn autostart_get(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn autostart_set(app: AppHandle, enabled: bool) -> Result<(), String> {
    let al = app.autolaunch();
    if enabled { al.enable() } else { al.disable() }.map_err(|e| e.to_string())
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let settings = MenuItem::with_id(app, "settings", "Réglages…", true, None::<&str>)?;
    let stats = MenuItem::with_id(app, "stats", "Voir les stats", true, None::<&str>)?;
    let sleep = MenuItem::with_id(app, "sleep", "Dodo / Réveil", true, None::<&str>)?;
    let home = MenuItem::with_id(app, "home", "Ramener Boune ici", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&settings, &stats, &sleep, &home, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Boune 🐰")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "settings" => open_settings(app.clone()),
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
        // Un seul lapin à la fois : relancer l'exe réveille l'instance existante
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app.emit("tray", "home".to_string());
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![
            cursor_pos,
            foreground_info,
            minimize_window,
            quit,
            open_settings,
            autostart_get,
            autostart_set
        ])
        .setup(|app| {
            build_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "settings" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Boune");
}
