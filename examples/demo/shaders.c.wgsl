@group(0) @binding(0) var<storage, read> extraData: array<f32>;
@group(1) @binding(0) var<storage, read> outputSize: u32;
@group(1) @binding(1) var<storage, read_write> output: array<f32>;

@compute @workgroup_size(64)
fn main (@builtin(global_invocation_id) global_id: vec3u, @builtin(local_invocation_id) local_id: vec3u) {
  if (global_id.x >= outputSize) {return;}

  output[global_id.x] = extraData[0] + f32(global_id.x);
}
