{
  description = "Dev shells for sheddex — eas-cli for building/submitting apps/mobile (EAS Build/Submit/Update), plus an Android SDK + emulator shell for running Expo Go locally without a physical device";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };

        # Android SDK packages are unfree (Google's own license) — accepted here via nixpkgs'
        # standard `android_sdk.accept_license` config flag (the documented way to avoid an
        # interactive license-acceptance prompt during the build) rather than editing any
        # system-wide NixOS config; this only affects evaluation of this flake's own `androidPkgs`
        # import, not the plain `pkgs` used for the `default` (eas-cli) shell above.
        androidPkgs = import nixpkgs {
          inherit system;
          config = {
            allowUnfree = true;
            android_sdk.accept_license = true;
          };
        };

        # A real, GUI-capable AVD (not a prebuilt "headless-only" image) — google_apis rather than
        # google_apis_playstore, so Expo Go can be sideloaded directly via `adb install`/`expo
        # start`'s own "open on Android" flow without needing a signed-in Google Play account on
        # the emulator at all. x86_64 for real hardware-accelerated (KVM) speed on this machine,
        # not the much slower arm64 image translation path.
        androidComposition = androidPkgs.androidenv.composeAndroidPackages {
          includeEmulator = true;
          includeSystemImages = true;
          systemImageTypes = [ "google_apis" ];
          abiVersions = [ "x86_64" ];
          platformVersions = [ "34" ];
          buildToolsVersions = [ "34.0.0" ];
          includeNDK = false;
          includeSources = false;
        };

        androidSdkRoot = "${androidComposition.androidsdk}/libexec/android-sdk";

        # A second, leaner composition for actually *compiling* the native Android app locally
        # (`./gradlew assembleDebug` / `npx expo run:android`) — deliberately separate from
        # `androidComposition` above, which bundles a full emulator system image (1-2GB+) that a
        # plain Gradle build never touches. `compileSdkVersion` 36 matches
        # `expo-modules-core`'s own real default (`ExpoModulesCorePlugin.gradle`'s
        # `safeExtGet("compileSdkVersion", 36)`, checked directly against the installed package
        # rather than guessed), not re-derived from the emulator shell's own (older, unrelated)
        # platform 34 pin. `includeNDK = true` — confirmed necessary, not assumed: React Native's
        # own Gradle plugin (`NdkConfiguratorUtils.kt`) wires every app's build through
        # `externalNativeBuild.cmake`, compiling Folly/Glog/Boost/JSI from source via CMake
        # regardless of whether the app has any custom native modules of its own, so the NDK is a
        # real, unavoidable local-build dependency, not an edge case. `ndkVersion` is pinned to the
        # *exact* version a real build actually asked for ("Configure project :" prints
        # ExpoRootProject's own resolved "ndk: 27.1.12297006") rather than left at "latest" — AGP
        # needs that exact side-by-side version present, and since the nix store path is
        # read-only, AGP's own "auto-install the missing version" fallback can't write into it
        # either (confirmed directly: a first attempt at "latest" (29.x) failed with
        # InstallFailedException: "The SDK directory is not writable"), so the right version has
        # to already be provisioned by nix itself, not discovered/fetched at build time.
        androidBuildComposition = androidPkgs.androidenv.composeAndroidPackages {
          includeEmulator = false;
          includeSystemImages = false;
          # Multiple platform/build-tools versions, not just the root project's own (36/36.0.0) —
          # confirmed necessary, not precautionary: a second real build attempt got past the first
          # NDK fix only to fail again on `:expo:generateDebugRFile` wanting
          # `build-tools;35.0.0` specifically (a different Expo module compiling against an older
          # compileSdk than the root project does). Provisioning 35/34 alongside 36 up front avoids
          # burning another ~10+ minute configuration-phase cycle on each individual version this
          # project's many subprojects might turn out to want one at a time.
          platformVersions = [ "36" "35" "34" ];
          buildToolsVersions = [ "36.0.0" "35.0.0" "34.0.0" ];
          includeNDK = true;
          ndkVersion = "27.1.12297006";
          includeSources = false;
          cmakeVersions = [ "3.22.1" ];
        };

        androidBuildSdkRoot = "${androidBuildComposition.androidsdk}/libexec/android-sdk";
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [ pkgs.eas-cli ];
        };

        # `nix develop .#desktop` — the system libraries the Tauri desktop app (apps/desktop) needs
        # on Linux: WebKitGTK and friends for the window; PipeWire (plus libclang, through
        # bindgenHook) and ALSA for the native audio engine. Rust comes from your own toolchain.
        devShells.desktop = pkgs.mkShell {
          nativeBuildInputs = [ pkgs.pkg-config pkgs.wrapGAppsHook3 pkgs.rustPlatform.bindgenHook ];
          buildInputs = [
            pkgs.webkitgtk_4_1
            pkgs.gtk3
            pkgs.libsoup_3
            pkgs.glib
            pkgs.glib-networking
            pkgs.cairo
            pkgs.pango
            pkgs.gdk-pixbuf
            pkgs.atk
            pkgs.librsvg
            pkgs.openssl
            pkgs.alsa-lib
            pkgs.pipewire
          ];
          shellHook = ''
            export GIO_MODULE_DIR=${pkgs.glib-networking}/lib/gio/modules
            export XDG_DATA_DIRS=${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS
            export ALSA_PLUGIN_DIR=${pkgs.pipewire}/lib/alsa-lib
            # WebKitGTK's GPU compositing is flaky on some Linux setups (blank window).
            export WEBKIT_DISABLE_DMABUF_RENDERER=1
          '';
        };

        # `nix develop .#androidBuild` — everything `./gradlew assembleDebug`/`npx expo run:android`
        # needs (SDK platform/build-tools, NDK, CMake, JDK 17), no emulator/system-image weight.
        # Gradle's own memory ceilings (heap/parallelism/daemon) are set in
        # `apps/mobile/android/gradle.properties` instead of here — that's where Gradle itself
        # actually reads them from, not an environment variable this shell could set.
        devShells.androidBuild = pkgs.mkShell {
          packages = [ androidBuildComposition.androidsdk pkgs.jdk17 pkgs.ninja ];
          ANDROID_HOME = androidBuildSdkRoot;
          ANDROID_SDK_ROOT = androidBuildSdkRoot;
          shellHook = ''
            export PATH="${androidBuildSdkRoot}/platform-tools:$PATH"
            echo "Android build SDK ready at $ANDROID_HOME"
          '';
        };

        # `nix develop .#android` — adb/emulator/avdmanager on PATH, ANDROID_HOME/ANDROID_SDK_ROOT
        # set, plus a JDK (avdmanager/sdkmanager are JVM tools). Kept as a separate shell from
        # `default` rather than folded into it, since this one's first build downloads several GB
        # of SDK/system-image packages from Google's servers — no reason to pay that cost (or pull
        # in a JDK) for the common case of just wanting `eas-cli`.
        devShells.android = pkgs.mkShell {
          packages = [ androidComposition.androidsdk pkgs.jdk17 ];
          ANDROID_HOME = androidSdkRoot;
          ANDROID_SDK_ROOT = androidSdkRoot;
          shellHook = ''
            export PATH="${androidSdkRoot}/platform-tools:${androidSdkRoot}/emulator:$PATH"
            echo "Android SDK ready at $ANDROID_HOME"
            echo "Create an AVD once:  avdmanager create avd -n sheddex -k \"system-images;android-34;google_apis;x86_64\" -d pixel_6"
            echo "Then run it:         emulator -avd sheddex"
          '';
        };
      });
}
