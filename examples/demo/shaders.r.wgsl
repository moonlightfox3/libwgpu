struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
}

@group(0) @binding(0) var<storage, read> extraData: array<f32>;

@vertex
fn vtxMain (@location(0) position: vec4f, @location(1) color: vec4f) -> VertexOut {
    let cpos = vec4f(extraData[0], extraData[1], 0, 1);
    let pos = rotatePoint2D(cpos, position, extraData[2]);

    return VertexOut(pos, color);
}
@fragment
fn fragMain (fragData: VertexOut) -> @location(0) vec4f {
    return fragData.color;
}

fn rotatePoint2D (cpos: vec4f, pos: vec4f, degs: f32) -> vec4f {
    let rads = radians(degs);
    let c = cos(rads); let s = sin(rads);

    return vec4f(
        (c * (pos.x - cpos.x)) + (s * (pos.y - cpos.y)) + cpos.x,
        (c * (pos.y - cpos.y)) - (s * (pos.x - cpos.x)) + cpos.y,
        0,
        1,
    );
}
