{
  description = "displayhive development environment";

  inputs = {
    # Pinned to the same revision as this machine's `<nixpkgs>` channel so
    # `nix-shell` and `nix develop` always resolve identical package versions
    # (e.g. `playwright-driver`'s bundled browser revisions, which must match
    # the `@playwright/test` version pinned in testing/package-lock.json).
    nixpkgs.url = "github:NixOS/nixpkgs/1c3fe55ad329cbcb28471bb30f05c9827f724c76";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        # `shell.nix` remains the single source of truth for the dev
        # environment (packages + shellHook) so `nix-shell` keeps working
        # unchanged; this just exposes the same shell via `nix develop`.
        devShells.default = import ./shell.nix { inherit pkgs; };
      }
    );
}
