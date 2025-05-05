class libwgpu {
    device = null
    shaderModule = null
    canvas = null
    ctx = null

    bindGroupLayoutList = null
    mainPipeline = null

    constructor (shaders = "", canvas = null) {
        this.shaders = shaders
        this.canvas = canvas
    }
    async initRender (enableExtraData = false) {
        await this.#init(false, enableExtraData)

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
    async initCompute (enableExtraData = false) {
        await this.#init(true, enableExtraData)

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
    async #init (isCompute = false, enableExtraData = false) {
        if (!navigator.gpu) throw new Error("WebGPU API not supported. (Try enabling hardware acceleration?)")

        let maxBindGroups = 0
        if (isCompute) maxBindGroups++
        if (enableExtraData) maxBindGroups++
        let adapter = await navigator.gpu.requestAdapter()
        this.device = await adapter.requestDevice({
            requiredLimits: {maxBindGroups},
        })

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
