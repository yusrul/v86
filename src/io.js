"use strict";

/**
 * The ISA IO bus
 * Devices register their ports here
 *
 * @constructor
 */
function IO()
{
    var a20_byte = 0,
        me = this;

    function get_port_description(addr)
    {
        // via seabios ioport.h
        var ports = {
            0x0004: "PORT_DMA_ADDR_2",
            0x0005: "PORT_DMA_CNT_2",
            0x000a: "PORT_DMA1_MASK_REG",
            0x000b: "PORT_DMA1_MODE_REG",
            0x000c: "PORT_DMA1_CLEAR_FF_REG",
            0x000d: "PORT_DMA1_MASTER_CLEAR",
            0x0020: "PORT_PIC1_CMD",
            0x0021: "PORT_PIC1_DATA",
            0x0040: "PORT_PIT_COUNTER0",
            0x0041: "PORT_PIT_COUNTER1",
            0x0042: "PORT_PIT_COUNTER2",
            0x0043: "PORT_PIT_MODE",
            0x0060: "PORT_PS2_DATA",
            0x0061: "PORT_PS2_CTRLB",
            0x0064: "PORT_PS2_STATUS",
            0x0070: "PORT_CMOS_INDEX",
            0x0071: "PORT_CMOS_DATA",
            0x0080: "PORT_DIAG",
            0x0081: "PORT_DMA_PAGE_2",
            0x0092: "PORT_A20",
            0x00a0: "PORT_PIC2_CMD",
            0x00a1: "PORT_PIC2_DATA",
            0x00b2: "PORT_SMI_CMD",
            0x00b3: "PORT_SMI_STATUS",
            0x00d4: "PORT_DMA2_MASK_REG",
            0x00d6: "PORT_DMA2_MODE_REG",
            0x00da: "PORT_DMA2_MASTER_CLEAR",
            0x00f0: "PORT_MATH_CLEAR",
            0x0170: "PORT_ATA2_CMD_BASE",
            0x01f0: "PORT_ATA1_CMD_BASE",
            0x0278: "PORT_LPT2",
            0x02e8: "PORT_SERIAL4",
            0x02f8: "PORT_SERIAL2",
            0x0374: "PORT_ATA2_CTRL_BASE",
            0x0378: "PORT_LPT1",
            0x03e8: "PORT_SERIAL3",
            //0x03f4: "PORT_ATA1_CTRL_BASE",
            0x03f0: "PORT_FD_BASE",
            0x03f2: "PORT_FD_DOR",
            0x03f4: "PORT_FD_STATUS",
            0x03f5: "PORT_FD_DATA",
            0x03f6: "PORT_HD_DATA",
            0x03f7: "PORT_FD_DIR",
            0x03f8: "PORT_SERIAL1",
            0x0cf8: "PORT_PCI_CMD",
            0x0cf9: "PORT_PCI_REBOOT",
            0x0cfc: "PORT_PCI_DATA",
            0x0402: "PORT_BIOS_DEBUG",
            0x0510: "PORT_QEMU_CFG_CTL",
            0x0511: "PORT_QEMU_CFG_DATA",
            0xb000: "PORT_ACPI_PM_BASE",
            0xb100: "PORT_SMB_BASE",
            0x8900:  "PORT_BIOS_APM"
        };

        if(ports[addr])
        {
            return "  (" + ports[addr] + ")";
        }
        else
        {
            return "";
        }
    }

    function empty_port_read_debug(port_addr)
    {
        dbg_log(
            "read port  #" + h(port_addr, 3) + get_port_description(port_addr),
            LOG_IO
        );

        return 0xFF;
    }

    function empty_port_write_debug(out_byte, port_addr)
    {
        dbg_log(
            "write port #" + h(port_addr, 3) + " <- " + h(out_byte, 2) + get_port_description(port_addr),
            LOG_IO
        );
    }

    function empty_port_read()
    {
        return 0xFF;
    }

    function empty_port_write(x)
    {
    }

    var read_callbacks = Array(0x10000),
        write_callbacks = Array(0x10000);

    for(var i = 0; i < 0x10000; i++)
    {
        // avoid sparse arrays

        if(DEBUG)
        {
            read_callbacks[i] = empty_port_read_debug;
            write_callbacks[i] = empty_port_write_debug;
        }
        else
        {
            read_callbacks[i] = empty_port_read;
            write_callbacks[i] = empty_port_write;
        }
    }

    /**
     * @param {number} port_addr
     * @param {function():number} callback
     */
    this.register_read = function(port_addr, callback)
    {
        read_callbacks[port_addr] = callback;
    };

    /**
     * @param {number} port_addr
     * @param {function(number)} callback
     */
    this.register_write = function(port_addr, callback)
    {
        write_callbacks[port_addr] = callback;
    };


    // should maybe be somewhere else?
    this.register_read(0x92, function()
    {
        return a20_byte;
    });

    this.register_write(0x92, function(out_byte)
    {
        a20_byte = out_byte;
    });

    if(DEBUG)
    {
        // use by linux for timing
        this.register_write(0x80, function(out_byte)
        {
        });
    }


    // any two consecutive 8-bit ports can be treated as a 16-bit port;
    // and four consecutive 8-bit ports can be treated as a 32-bit port
    //
    // http://css.csail.mit.edu/6.858/2012/readings/i386/s08_01.htm
    //
    // This info seems to be incorrect, at least some multibyte ports are next
    // to each other, such as 1CE and 1CF (VBE dispi) or the 170 (ATA data port).
    //
    // As a workaround, we pass the original port to the callback as the last argument.


    this.port_write8 = function(port_addr, out_byte)
    {
        write_callbacks[port_addr](out_byte, port_addr);
    };

    this.port_write16 = function(port_addr, out_byte)
    {
        if(port_addr <= 0xFFFE)
        {
            write_callbacks[port_addr](out_byte & 0xFF, port_addr);
            write_callbacks[port_addr + 1](out_byte >> 8, port_addr);
        }
        else
        {
            dbg_log("Ignored 2 byte write to port " + h(port_addr), LOG_IO);
        }
    };

    this.port_write32 = function(port_addr, out_byte)
    {
        if(port_addr <= 0xFFFC)
        {
            write_callbacks[port_addr](out_byte & 0xFF, port_addr);
            write_callbacks[port_addr + 1](out_byte >> 8 & 0xFF, port_addr);
            write_callbacks[port_addr + 2](out_byte >> 16 & 0xFF, port_addr);
            write_callbacks[port_addr + 3](out_byte >>> 24, port_addr);
        }
        else
        {
            dbg_log("Ignored 4 byte write to port " + h(port_addr), LOG_IO);
        }
    };

    // read byte from port
    this.port_read8 = function(port_addr)
    {
        return read_callbacks[port_addr](port_addr);
    };

    this.port_read16 = function(port_addr)
    {
        if(port_addr <= 0xFFFE)
        {
            return read_callbacks[port_addr](port_addr) | 
                        read_callbacks[port_addr + 1](port_addr) << 8;
        }
        else
        {
            dbg_log("Ignored 2 byte read from port " + h(port_addr), LOG_IO);
        }
    };

    this.port_read32 = function(port_addr)
    {
        if(port_addr <= 0xFFFC)
        {
            return read_callbacks[port_addr](port_addr) | 
                        read_callbacks[port_addr + 1](port_addr) << 8 | 
                        read_callbacks[port_addr + 2](port_addr) << 16 | 
                        read_callbacks[port_addr + 3](port_addr) << 24;
        }
        else
        {
            dbg_log("Ignored 4 byte read from port " + h(port_addr), LOG_IO);
        }
    };
}

