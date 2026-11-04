# Test fixtures

- `turbine-draco-ktx2.glb`: the demo wind turbine (Kenney City Kit (Industrial), CC0 1.0) re-encoded with
  Draco geometry and a KTX2 (Basis ETC1S) texture, to check that compressed deliveries load with the
  bundled decoders. Made with glTF Transform (`draco()`) and ktx2-encoder (`ktx2({ isUASTC: false })`).
