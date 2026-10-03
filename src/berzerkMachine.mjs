// Berzerk running as the cartridge does: the translated code (berzerkRecomp.mjs)
// on the 2600 bus (vcsBus.mjs), with the cartridge's data tables in ROM space.
// runFrame() plays one frame, up to the next VSYNC; the finished picture is in
// bus.tia.lastFrame and the sound registers in bus.audio.
import { M6502 } from './cpu6502.mjs';
import { VcsBus } from './vcsBus.mjs';
import { romImage } from './berzerkRomData.mjs';
import { run, START } from './berzerkRecomp.mjs';

export class BerzerkMachine {
  constructor() {
    this.bus = new VcsBus(romImage());
    this.cpu = new M6502(this.bus);
    this.bus.cpu = this.cpu;
    this.cpu.pc = START;
    this.cpu.s = 0xfd;
  }

  runFrame() {
    if (!run(this.cpu, this.bus)) throw new Error(`frame did not end (pc $${this.cpu.pc.toString(16)})`);
  }
}
