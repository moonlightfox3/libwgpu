const gradientDiff: f32 = 0.00023;
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
    let x: f32 = fragData.position.x;
    let y: f32 = fragData.position.y;

    let r: f32 = frameSin(1.5, 4.5, x, y);
    let g: f32 = frameSin(2.5, 5.5, x, y);
    let b: f32 = frameSin(3.5, 6.5, x, y);
    return vec4f(r, g, b, 1);
}

fn frameSin (val1: f32, val2: f32, x: f32, y: f32) -> f32 {
    let frame: f32 = extraData[0] + (x * gradientDiff) + (y * gradientDiff);

    let out1: f32 = sin(frame - (val1 * PId3));
    let out2: f32 = sin(frame - (val2 * PId3));
    return max(0.0, max(out1, out2));
}
