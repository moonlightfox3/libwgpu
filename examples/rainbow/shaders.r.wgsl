const PId3: f32 = radians(180.0) / 3.0;

struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
}

@group(0) @binding(0) var<storage, read> extraData: array<f32>;

@vertex
fn vtxMain (@location(0) position: vec4f, @location(1) color: vec4f) -> VertexOut {
    return VertexOut(position, color);
}
@fragment
fn fragMain (fragData: VertexOut) -> @location(0) vec4f {
    let r: f32 = frameSin(1.5, 4.5);
    let g: f32 = frameSin(2.5, 5.5);
    let b: f32 = frameSin(3.5, 6.5);
    return vec4f(r, g, b, 1);
}

fn frameSin (val1: f32, val2: f32) -> f32 {
    let out1: f32 = sin(extraData[0] - (val1 * PId3));
    let out2: f32 = sin(extraData[0] - (val2 * PId3));
    return max(0.0, max(out1, out2));
}
