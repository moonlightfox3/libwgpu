/**
 * libwgpu library main
 * @class
 */
class libwgpu {
    device = null /** @type {GPUDevice} */
    shaderModule = null /** @type {GPUShaderModule} */
    canvas = null /** @type {(HTMLCanvasElement|null)} */
    ctx = null /** @type {(GPUCanvasContext|null)} */

    bindGroupLayoutList = null /** @type {Array} */
    mainPipeline = null /** @type {(GPURenderPipeline|GPUComputePipeline)} */

    /**
     * Constructor for a new libwgpu instance
     * @constructor
     * @param {string} shaders - The WGSL shaders to use (as a string)
     * @param {(HTMLCanvasElement|null)} canvas - The HTMLCanvasElement to render to (if rendering), or null (if computing)
     */
    constructor (shaders = "", canvas = null) {
        this.shaders = shaders
        this.canvas = canvas
    }
    /**
     * Initializes this libwgpu instance for rendering (should only be called once)
     * @param {boolean} enableExtraData - If the extraData parameter can be passed to this.render()
     * @returns {libwgpu} This libwgpu instance
     */
    async initRender (enableExtraData = false) {
        await this.#init()

        let bindGroup0Layout = libwgpu.createBindGroupLayout(this.device, "r", GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT)
        this.bindGroupLayoutList = []
        if (enableExtraData) this.bindGroupLayoutList = [bindGroup0Layout]

        this.mainPipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: this.bindGroupLayoutList,
            }),
            primitive: {
                topology: "triangle-list",
            },
            vertex: {
                module: this.shaderModule,
                entryPoint: "vtxMain",
                buffers: [{
                    attributes: [
                        {
                            shaderLocation: 0,
                            offset: 0,
                            format: "float32x4",
                        },
                        {
                            shaderLocation: 1,
                            offset: 16,
                            format: "float32x4",
                        },
                    ],
                    arrayStride: 32,
                    stepMode: "vertex",
                }],
            },
            fragment: {
                module: this.shaderModule,
                entryPoint: "fragMain",
                targets: [{
                    format: navigator.gpu.getPreferredCanvasFormat(),
                }],
            },
        })

        return this
    }
    /**
     * Initializes this libwgpu instance for computing (should only be called once)
     * @param {boolean} enableExtraData - If the extraData parameter can be passed to this.compute()
     * @returns {libwgpu} This libwgpu instance
     */
    async initCompute (enableExtraData = false) {
        await this.#init()

        let bindGroup0Layout = libwgpu.createBindGroupLayout(this.device, "r", GPUShaderStage.COMPUTE)
        let bindGroup1Layout = libwgpu.createBindGroupLayout(this.device, "rb", GPUShaderStage.COMPUTE)
        this.bindGroupLayoutList = [bindGroup1Layout]
        if (enableExtraData) this.bindGroupLayoutList = [bindGroup0Layout, bindGroup1Layout]
        
        this.mainPipeline = this.device.createComputePipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: this.bindGroupLayoutList,
            }),
            compute: {
                module: this.shaderModule,
                entryPoint: "main",
            },
        })

        return this
    }
    /**
     * Initializes this libwgpu instance (used for both rendering and computing)
     * @private
     */
    async #init () {
        if (!navigator.gpu) throw new Error("WebGPU API not supported. (Try enabling hardware acceleration?)")

        let adapter = await navigator.gpu.requestAdapter()
        this.device = await adapter.requestDevice()

        if (this.canvas != null) {
            let canvasStyle = getComputedStyle(this.canvas)
            this.canvas.width = parseInt(canvasStyle.width), this.canvas.height = parseInt(canvasStyle.height)
            
            this.ctx = this.canvas.getContext("webgpu")
            this.ctx.configure({
                device: this.device,
                format: navigator.gpu.getPreferredCanvasFormat(),
                alphaMode: "premultiplied",
            })
        }

        this.shaderModule = this.device.createShaderModule({
            code: this.shaders,
        })
    }


    /**
     * Renders something to this instance's HTMLCanvasElement (passed to the constructor)
     * @param {Float32Array} vertices - The vertices to render (a list of triangles), formatted as XYZWRGBA
     * @param {Array} clearColor - The clear (background) color to render, formatted as RGBA
     * @param {Float32Array} extraData - Extra data to pass to the shaders (needs to be enabled from this.initRender())
     */
    render (vertices = new Float32Array([]), clearColor = [0, 0, 0, 0], extraData = new Float32Array([])) {
        let vertexBuffer = this.device.createBuffer({
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        })
        this.device.queue.writeBuffer(vertexBuffer, 0, vertices.buffer)
        
        let bindGroup0Group = null, extraDataBuffer = null
        if (extraData.byteLength > 0) {
            extraDataBuffer = this.device.createBuffer({
                size: extraData.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            })
            this.device.queue.writeBuffer(extraDataBuffer, 0, extraData.buffer)
            bindGroup0Group = libwgpu.createBindGroup(this.device, this.bindGroupLayoutList[0], [extraDataBuffer])
        }

        let renderPassDescriptor = {
            colorAttachments: [{
                clearValue: clearColor,
                loadOp: "clear",
                storeOp: "store",
                view: this.ctx.getCurrentTexture().createView(),
            }],
        }

        let commandEncoder = this.device.createCommandEncoder()
        let passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)
        passEncoder.setPipeline(this.mainPipeline)
        if (extraData.byteLength > 0) passEncoder.setBindGroup(0, bindGroup0Group)
        passEncoder.setVertexBuffer(0, vertexBuffer)
        passEncoder.draw(vertices.length / 8)
        passEncoder.end()

        this.device.queue.submit([commandEncoder.finish()])
        vertexBuffer.destroy()
        if (extraDataBuffer != null) extraDataBuffer.destroy()
    }
    /**
     * Computes something
     * @param {number} bufferSize - Size of the buffer to create (shared with the shaders)
     * @param {Float32Array} extraData - Extra data to pass to the shaders (needs to be enabled from this.initCompute())
     * @returns {Float32Array} The contents of the created buffer, after being processed by the shaders
     */
    async compute (bufferSize = 1, extraData = new Float32Array([])) {
        let outputSizeBuffer = this.device.createBuffer({
            size: 1 * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        })
        this.device.queue.writeBuffer(outputSizeBuffer, 0, new Uint32Array([bufferSize]).buffer)
        let outputBuffer = this.device.createBuffer({
            size: bufferSize * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        })
        let outputReadBufferTemp = this.device.createBuffer({
            size: bufferSize * 4,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        })

        let bindGroup0Group = null, extraDataBuffer = null
        if (extraData.byteLength > 0) {
            extraDataBuffer = this.device.createBuffer({
                size: extraData.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            })
            this.device.queue.writeBuffer(extraDataBuffer, 0, extraData.buffer)
            bindGroup0Group = libwgpu.createBindGroup(this.device, this.bindGroupLayoutList[0], [extraDataBuffer])
        }
        let bindGroup1Group = libwgpu.createBindGroup(this.device, this.bindGroupLayoutList[this.bindGroupLayoutList.length - 1], [outputSizeBuffer, outputBuffer])
        
        let commandEncoder = this.device.createCommandEncoder()
        let passEncoder = commandEncoder.beginComputePass()
        passEncoder.setPipeline(this.mainPipeline)
        if (extraData.byteLength == 0) passEncoder.setBindGroup(0, bindGroup1Group)
        else {
            passEncoder.setBindGroup(0, bindGroup0Group)
            passEncoder.setBindGroup(1, bindGroup1Group)
        }
        passEncoder.dispatchWorkgroups(Math.ceil(bufferSize / 64))
        passEncoder.end()

        commandEncoder.copyBufferToBuffer(outputBuffer, 0, outputReadBufferTemp, 0, bufferSize * 4)
        this.device.queue.submit([commandEncoder.finish()])
        outputSizeBuffer.destroy()
        outputBuffer.destroy()
        if (extraDataBuffer != null) extraDataBuffer.destroy()

        await outputReadBufferTemp.mapAsync(GPUMapMode.READ, 0, bufferSize * 4)
        let copyArrayBuffer = outputReadBufferTemp.getMappedRange(0, bufferSize * 4)
        let data = copyArrayBuffer.slice()
        outputReadBufferTemp.unmap()
        outputReadBufferTemp.destroy()

        return new Float32Array(data)
    }


    /**
     * Creates a GPUBindGroupLayout
     * @param {GPUDevice} device - The GPUDevice to create a GPUBindGroupLayout for
     * @param {string} typeSequence - A sequence of ("r"|"b") (meaning "read" or "both"), to set which buffer(s) in the GPUBindGroup created with this GPUBindGroupLayout are read-only or read-write
     * @param {number} visibility - One or more of GPUShaderStage.(COMPUTE|FRAGMENT|VERTEX) (used to set the visibility/accessibility of the bind group)
     * @returns {GPUBindGroupLayout} The created GPUBindGroupLayout
     */
    static createBindGroupLayout (device, typeSequence = "", visibility) {
        let entries = []
        for (let i = 0; i < typeSequence.length; i++) {
            entries.push({
                binding: i,
                visibility,
                buffer: {
                    type: typeSequence[i] == "r" ? "read-only-storage" : "storage",
                },
            })
        }

        let layout = device.createBindGroupLayout({entries})
        return layout
    }
    /**
     * Creates a GPUBindGroup
     * @param {GPUDevice} device - The GPUDevice to create a GPUBindGroup for
     * @param {GPUBindGroupLayout} layout - The GPUBindGroupLayout to create a GPUBindGroup from
     * @param {Array} buffers - An array of GPUBuffer object instances to bind to the created GPUBindGroup
     * @returns {GPUBindGroup} The created GPUBindGroup
     */
    static createBindGroup (device, layout, buffers) {
        let entries = []
        for (let i = 0; i < buffers.length; i++) {
            entries.push({
                binding: i,
                resource: {
                    buffer: buffers[i],
                },
            })
        }

        let group = device.createBindGroup({layout, entries})
        return group
    }
    
    /**
     * Creates a list of triangle vertices from a list of quad vertices
     * @param {Array} vertices - A list of quad vertices, formatted as XYZWRGBA
     * @returns {Array} A list of triangle vertices, formatted as XYZWRGBA
     */
    static createQuadVertices (vertices) {
        let vertexList = []
        for (let i = 0; i < vertices.length; i += 8) vertexList.push(vertices.slice(i, i + 8))
        
        return [
            ...vertexList[0],
            ...vertexList[2],
            ...vertexList[3],

            ...vertexList[0],
            ...vertexList[1],
            ...vertexList[3],
        ]
    }
}
