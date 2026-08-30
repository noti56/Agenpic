//! WebView2 (Windows) does not auto-grant getUserMedia camera/microphone
//! requests the way the Edge browser shell does — an app embedding WebView2
//! must register its own PermissionRequested handler or every request is
//! left to the OS-level prompt, and once a user dismisses/blocks it there is
//! no in-app way to re-trigger it (the block is persisted per-origin in the
//! WebView2 profile). Since proximity voice/video is a core, trusted feature
//! of this app (not third-party content), auto-allow camera/mic requests
//! from our own webview instead of relying on that prompt.
#[cfg(target_os = "windows")]
pub fn grant_media_permissions(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
        COREWEBVIEW2_PERMISSION_STATE_DEFAULT,
    };
    use webview2_com::PermissionRequestedEventHandler;

    let result = window.with_webview(|webview| {
        let controller = webview.controller();
        let core = match unsafe { controller.CoreWebView2() } {
            Ok(core) => core,
            Err(err) => {
                eprintln!("[media-permissions] failed to get CoreWebView2: {err:?}");
                return;
            }
        };

        let handler = PermissionRequestedEventHandler::create(Box::new(|_sender, args| {
            if let Some(args) = args {
                let mut kind = COREWEBVIEW2_PERMISSION_KIND(0);
                unsafe { args.PermissionKind(&mut kind)? };
                let state = if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
                    || kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA
                {
                    COREWEBVIEW2_PERMISSION_STATE_ALLOW
                } else {
                    COREWEBVIEW2_PERMISSION_STATE_DEFAULT
                };
                unsafe { args.SetState(state)? };
            }
            Ok(())
        }));

        let mut token = 0i64;
        if let Err(err) = unsafe { core.add_PermissionRequested(&handler, &mut token) } {
            eprintln!("[media-permissions] failed to register PermissionRequested handler: {err:?}");
        }
    });

    if let Err(err) = result {
        eprintln!("[media-permissions] with_webview failed: {err:?}");
    }
}

#[cfg(not(target_os = "windows"))]
pub fn grant_media_permissions(_window: &tauri::WebviewWindow) {
    // macOS/Linux webviews (WKWebView / WebKitGTK) surface the native OS
    // permission prompt for getUserMedia directly, without needing this.
}
