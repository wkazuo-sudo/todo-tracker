fn main() {
    println!("cargo:rerun-if-env-changed=TODO_TRACKER_WIDGET_GROUP_ID");
    tauri_build::build()
}
