// =============================================================================
// TIA Register Addresses (Direct register mappings)
// Ported from: Berzerk (decomp).asm
// These are the hardware register addresses used in the original port
// =============================================================================

// Color registers
export const TIA_COLOR0 = 0x00;
export const TIA_COLOR1 = 0x01;
export const TIA_COLUPF = 0x02;
export const TIA_COLUP0 = 0x03;
export const TIA_COLUP1 = 0x04;
export const TIA_COLORH0 = 0x05;
export const TIA_COLORM = 0x06;
export const TIA_VDELP0 = 0x07;
export const TIA_VDELP1 = 0x08;
export const TIA_VDELBL = 0x09;
export const TIA_RESMP0 = 0x0a;
export const TIA_RESMP1 = 0x0b;
export const TIA_RESBL = 0x0c;
export const TIA_PFM0 = 0x0d;
export const TIA_PFM1 = 0x0e;
export const TIA_PF0 = 0x0f;

// Control registers
export const TIA_VSYNC = 0x10;
export const TIA_VSWP = 0x11;
export const TIA_ENPF = 0x12;
export const TIA_ENM0 = 0x13;
export const TIA_ENM1 = 0x14;
export const TIA_ENP0 = 0x15;
export const TIA_ENBALL = 0x16;
export const TIA_HM0 = 0x17;
export const TIA_HMP0 = 0x18;
export const TIA_HMP1 = 0x19;
export const TIA_HMBL = 0x1a;
export const TIA_VSIZEP0 = 0x1b;
export const TIA_VSIZEP1 = 0x1c;
export const TIA_VSIZEBL = 0x1d;
export const TIA_HSIZEP0 = 0x1e;
export const TIA_HSIZEP1 = 0x1f;

// Size/position registers
export const TIA_NUSIZ0 = 0x20;
export const TIA_NUSIZ1 = 0x21;
export const TIA_RIOT_SWCHA = 0x22;
export const TIA_RIOT_SWACNT = 0x23;
export const TIA_RIOT_SWCHB = 0x24;
export const TIA_RIOT_SWBCNT = 0x25;
export const TIA_RIOT_TIMER = 0x26;
export const TIA_RIOT_INTEN = 0x27;
export const TIA_RIOT_INTCL = 0x28;
export const TIA_RIOT_TIMINT = 0x29;
export const TIA_RIOT_POKETB = 0x2a;
export const TIA_RIOT_ATIME = 0x2b;

// Player registers
export const TIA_RESP0 = 0x2c;
export const TIA_P0XR = 0x2d;
export const TIA_P0XF = 0x2e;
export const TIA_VRSL = 0x2f;

// Robot registers
export const TIA_RESP1 = 0x30;
export const TIA_R1XR = 0x31;
export const TIA_R1XF = 0x32;
export const TIA_R2XR = 0x33;
export const TIA_R2XF = 0x34;
export const TIA_R3XR = 0x35;
export const TIA_R3XF = 0x36;
export const TIA_R4XR = 0x37;
export const TIA_R4XF = 0x38;
export const TIA_R5XR = 0x39;
export const TIA_R5XF = 0x3a;
export const TIA_R6XR = 0x3b;
export const TIA_R6XF = 0x3c;
export const TIA_R7XR = 0x3d;
export const TIA_R7XF = 0x3e;

// More player/missile registers
export const TIA_R8XR = 0x3f;
export const TIA_R8XF = 0x40;
export const TIA_R9XR = 0x41;
export const TIA_R9XF = 0x42;
export const TIA_R10XR = 0x43;
export const TIA_R10XF = 0x44;
export const TIA_R11XR = 0x45;
export const TIA_R11XF = 0x46;
export const TIA_R12XR = 0x47;
export const TIA_R12XF = 0x48;
export const TIA_R13XR = 0x49;
export const TIA_R13XF = 0x4a;
export const TIA_R14XR = 0x4b;
export const TIA_R14XF = 0x4c;
export const TIA_R15XR = 0x4d;
export const TIA_R15XF = 0x4e;
export const TIA_R16XR = 0x4f;
export const TIA_R16XF = 0x50;
export const TIA_R17XR = 0x51;
export const TIA_R17XF = 0x52;
export const TIA_R18XR = 0x53;
export const TIA_R18XF = 0x54;
export const TIA_R19XR = 0x55;
export const TIA_R19XF = 0x56;
export const TIA_R20XR = 0x57;
export const TIA_R20XF = 0x58;
export const TIA_R21XR = 0x59;
export const TIA_R21XF = 0x5a;
export const TIA_R22XR = 0x5b;
export const TIA_R22XF = 0x5c;
export const TIA_R23XR = 0x5d;
export const TIA_R23XF = 0x5e;
export const TIA_R24XR = 0x5f;
export const TIA_R24XF = 0x60;
export const TIA_R25XR = 0x61;
export const TIA_R25XF = 0x62;
export const TIA_R26XR = 0x63;
export const TIA_R26XF = 0x64;
export const TIA_R27XR = 0x65;
export const TIA_R27XF = 0x66;
export const TIA_R28XR = 0x67;
export const TIA_R28XF = 0x68;
export const TIA_R29XR = 0x69;
export const TIA_R29XF = 0x6a;
export const TIA_R30XR = 0x6b;
export const TIA_R30XF = 0x6c;
export const TIA_R31XR = 0x6d;
export const TIA_R31XF = 0x6e;
export const TIA_R32XR = 0x6f;
export const TIA_R32XF = 0x70;

// Collision registers (read-only)
export const TIA_CXM0P = 0x71;
export const TIA_CXM1P = 0x72;
export const TIA_CXP0FB = 0x73;
export const TIA_CXM1FB = 0x74;
export const TIA_CXBLPF = 0x75;
export const TIA_CXPPMM = 0x76;
export const TIA_TIAINPUTS = 0x77;

// Ball registers
export const TIA_RESPBL = 0x78;
export const TIA_BLXR = 0x79;
export const TIA_BLXF = 0x7a;

// Missile registers
export const TIA_RESPM0 = 0x7b;
export const TIA_RESPM1 = 0x7c;
export const TIA_M0XR = 0x7d;
export const TIA_M0XF = 0x7e;
export const TIA_M1XR = 0x7f;
export const TIA_M1XF = 0x80;

// Graphic control
export const TIA_TIAINPUTS2 = 0x81;
export const TIA_P0CFGR = 0x82;
export const TIA_P0CGF = 0x83;
export const TIA_P1CFGR = 0x84;
export const TIA_P1CGF = 0x85;
export const TIA_M0CFGR = 0x86;
export const TIA_M0CGF = 0x87;
export const TIA_M1CFGR = 0x88;
export const TIA_M1CGF = 0x89;
export const TIA_BALLCFGR = 0x8a;
export const TIA_BALLCGF = 0x8b;
export const TIA_PFB = 0x8c;

// Additional registers
export const TIA_R33XR = 0x8d;
export const TIA_R33XF = 0x8e;
export const TIA_R34XR = 0x8f;
export const TIA_R34XF = 0x90;
export const TIA_R35XR = 0x91;
export const TIA_R35XF = 0x92;
export const TIA_R36XR = 0x93;
export const TIA_R36XF = 0x94;
export const TIA_R37XR = 0x95;
export const TIA_R37XF = 0x96;
export const TIA_R38XR = 0x97;
export const TIA_R38XF = 0x98;
export const TIA_R39XR = 0x99;
export const TIA_R39XF = 0x9a;
export const TIA_R40XR = 0x9b;
export const TIA_R40XF = 0x9c;
export const TIA_R41XR = 0x9d;
export const TIA_R41XF = 0x9e;
export const TIA_R42XR = 0x9f;
export const TIA_R42XF = 0xa0;
export const TIA_R43XR = 0xa1;
export const TIA_R43XF = 0xa2;
export const TIA_R44XR = 0xa3;
export const TIA_R44XF = 0xa4;
export const TIA_R45XR = 0xa5;
export const TIA_R45XF = 0xa6;
export const TIA_R46XR = 0xa7;
export const TIA_R46XF = 0xa8;
export const TIA_R47XR = 0xa9;
export const TIA_R47XF = 0xaa;
export const TIA_R48XR = 0xab;
export const TIA_R48XF = 0xac;
export const TIA_R49XR = 0xad;
export const TIA_R49XF = 0xae;
export const TIA_R50XR = 0xaf;
export const TIA_R50XF = 0xb0;
export const TIA_R51XR = 0xb1;
export const TIA_R51XF = 0xb2;
export const TIA_R52XR = 0xb3;
export const TIA_R52XF = 0xb4;
export const TIA_R53XR = 0xb5;
export const TIA_R53XF = 0xb6;
export const TIA_R54XR = 0xb7;
export const TIA_R54XF = 0xb8;
export const TIA_R55XR = 0xb9;
export const TIA_R55XF = 0xba;
export const TIA_R56XR = 0xbb;
export const TIA_R56XF = 0xbc;
export const TIA_R57XR = 0xbd;
export const TIA_R57XF = 0xbe;
export const TIA_R58XR = 0xbf;
export const TIA_R58XF = 0xc0;
export const TIA_R59XR = 0xc1;
export const TIA_R59XF = 0xc2;
export const TIA_R60XR = 0xc3;
export const TIA_R60XF = 0xc4;
export const TIA_R61XR = 0xc5;
export const TIA_R61XF = 0xc6;
export const TIA_R62XR = 0xc7;
export const TIA_R62XF = 0xc8;
export const TIA_R63XR = 0xc9;
export const TIA_R63XF = 0xca;

// TIA Control
export const TIA_WSYNC = 0x2f;
export const TIA_T1PC = 0x78;
export const TIA_AI0C = 0x79;
export const TIA_AI1C = 0x7a;
export const TIA_AI2C = 0x7b;
export const TIA_AI3C = 0x7c;
export const TIA_AI4C = 0x7d;
export const TIA_AI5C = 0x7e;
export const TIA_AI6C = 0x7f;
export const TIA_AI7C = 0x80;
export const TIA_AI8C = 0x81;
export const TIA_AI9C = 0x82;
export const TIA_AI10C = 0x83;
export const TIA_AI11C = 0x84;
export const TIA_AI12C = 0x85;
export const TIA_AI13C = 0x86;
export const TIA_AI14C = 0x87;
export const TIA_AI15C = 0x88;
export const TIA_AI16C = 0x89;
export const TIA_AI17C = 0x8a;
export const TIA_AI18C = 0x8b;
export const TIA_AI19C = 0x8c;
export const TIA_AI20C = 0x8d;
export const TIA_AI21C = 0x8e;
export const TIA_AI22C = 0x8f;
export const TIA_AI23C = 0x90;
export const TIA_AI24C = 0x91;
export const TIA_AI25C = 0x92;
export const TIA_AI26C = 0x93;
export const TIA_AI27C = 0x94;
export const TIA_AI28C = 0x95;
export const TIA_AI29C = 0x96;
export const TIA_AI30C = 0x97;
export const TIA_AI31C = 0x98;
export const TIA_AI32C = 0x99;
export const TIA_AI33C = 0x9a;
export const TIA_AI34C = 0x9b;
export const TIA_AI35C = 0x9c;
export const TIA_AI36C = 0x9d;
export const TIA_AI37C = 0x9e;
export const TIA_AI38C = 0x9f;
export const TIA_AI39C = 0xa0;
export const TIA_AI40C = 0xa1;
export const TIA_AI41C = 0xa2;
export const TIA_AI42C = 0xa3;
export const TIA_AI43C = 0xa4;
export const TIA_AI44C = 0xa5;
export const TIA_AI45C = 0xa6;
export const TIA_AI46C = 0xa7;
export const TIA_AI47C = 0xa8;
export const TIA_AI48C = 0xa9;
export const TIA_AI49C = 0xaa;
export const TIA_AI50C = 0xab;
export const TIA_AI51C = 0xac;
export const TIA_AI52C = 0xad;
export const TIA_AI53C = 0xae;
export const TIA_AI54C = 0xaf;
export const TIA_AI55C = 0xb0;
export const TIA_AI56C = 0xb1;
export const TIA_AI57C = 0xb2;
export const TIA_AI58C = 0xb3;
export const TIA_AI59C = 0xb4;
export const TIA_AI60C = 0xb5;
export const TIA_AI61C = 0xb6;
export const TIA_AI62C = 0xb7;
export const TIA_AI63C = 0xb8;

// TIA Graphics Control
export const TIA_RIOT_POKEY = 0xc9;
export const TIA_RIOT_POKEYF = 0xca;

// TIA Misc
export const TIA_RIOT_TIMER1 = 0x26;

// TIA Graphic Control
export const TIA_TIAINPUTS3 = 0x81;
export const TIA_TIAINPUTS4 = 0x82;

// TIA Collision registers
export const TIA_CXMMI = 0x77;
