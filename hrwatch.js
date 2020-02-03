const HRW_HRMONITOR_ADDR = CHANGE_ME;
const HRW_AGE = CHANGE_ME;
const HRW_PASSWORD = CHANGE_ME;

E.setPassword(HRW_PASSWORD);
E.lockConsole();

var gatt;
var adv_enabled = true;

// OLED driver taken from https://gist.github.com/fanoush/ce461c73c299834bcb53a615721b5a2e
Modules.addCached("DSD6OLED",function(){
//modified SSD1306, 128x32 but needs 0xda,0x12
// commands sent when initialising the display
var initCmds = new Uint8Array([
0xAe, // 0 disp off
0xD5, // 1 clk div
0x80, // 2 suggested ratio
0xA8, 31, // 3 set multiplex, height-1
0xD3,0x0, // 5 display offset
0x40, // 7 start line
0x8D, 0x14, // 8 charge pump
0x20,0x0, // 10 memory mode - horizontal
0xA1, // 12 seg remap 1
0xC0, // 13 comscandec
0xDA, 0x12, // 14 set compins, height==64 ? 0x12:0x02,
0x81, 0xCF, // 16 set contrast
0xD9, 0xF1, // 18 set precharge
0xDb, 0x40, // 20 set vcom detect
0xA4, // 22 display all on
0xA6, // 23 display normal (non-inverted)
0xAf // 24 disp on
]);

// commands sent when sending data to the display
var flipCmds = new Uint8Array([
0x21, // columns
0, 127, // OLED_WIDTH-1
0x22, // pages
0, 3 /* (height>>3)-1 */
]);

var rotCmds = Uint8Array([
0x20,0x0, // 10 memory mode - horizontal
0xA1, // 12 seg remap 1
0xC0, // 13 comscandec
]);

var rot;
var gfxV;
var gfxH;

exports.connectSPI = function(spi, dc,  rst, callback, options) {
  if (rst) rst.reset();
  var cs = options?options.cs:undefined;
  var r = options&&options.rotation?options.rotation:90;
  if (options && options.contrast>=0) initCmds[17] = options.contrast;
  var oled = {};
  gfxV=Graphics.createArrayBuffer(32,128,1,{vertical_byte : false});
  gfxH=Graphics.createArrayBuffer(128,32,1,{vertical_byte : true});
  oled.isOn=false;
  oled.init = function(cmdArray){
    if (cs) cs.reset();
    // configure the OLED
    digitalWrite(dc,0); // command
    spi.write(cmdArray);
    digitalWrite(dc,1); // data
    if (cs) cs.set();
  };
  oled.setRotation = function(r){
    if (r === 0){rotCmds[1]=1;rotCmds[2]=0xa1;rotCmds[3]=0xc8;}
    if (r === 180){rotCmds[1]=1;rotCmds[2]=0xa0;rotCmds[3]=0xc0;}
    if (r === 90){rotCmds[1]=0;rotCmds[2]=0xa1;rotCmds[3]=0xc0;}
    if (r === 270){rotCmds[1]=0;rotCmds[2]=0xa0;rotCmds[3]=0xc8;}
    oled.gfx=(r%180===0)?gfxV:gfxH;
    rot=r;
    oled.init(rotCmds);
  };
  if (rst) digitalPulse(rst,0,20);
  setTimeout(function() {
    oled.init(initCmds);
    oled.setRotation(r);
    oled.isOn=true;
    // if there is a callback, call it now(ish)
    if (callback !== undefined) setTimeout(callback, 10);
  }, 50);
  // write to the screen
  oled.flip = function() {
    // set how the data is to be sent (whole screen)
    if (cs) cs.reset();
    digitalWrite(dc,0);// command
    spi.write(flipCmds);
    digitalWrite(dc,1);// data
    spi.write(((rot%180===0)?gfxV:gfxH).buffer);
    if (cs) cs.set();
  };

  // set contrast, 0..255
  oled.setContrast = function(c) {
    if (cs) cs.reset();
    spi.write(0x81,c,dc);
    if (cs) cs.set();
  };
  // set off
  oled.off = function() {
    if (cs) cs.reset();
    spi.write(0xAE,dc);
    if (cs) cs.set();
    oled.isOn=false;
  };

  // set on
  oled.on = function() {
    if (cs) cs.reset();
    spi.write(0xAF,dc);
    if (cs) cs.set();
    oled.isOn=true;
  };

  // return graphics
  return oled;
};
});

Modules.addCached("DSD6",function(){

// D3 pin is battery voltage
// D2 pin is analog charger voltage
// with known 5V input  5.0/analogRead(D2) gave me 6.61207596594
// feel free to recalibrate yourself
exports.battVoltage=function(){
  var v=6.61207596594*analogRead(D3);
  //poke32(0x5000070c,2); // disconnect pin for power saving, otherwise it draws 70uA more
  return v;
};
exports.chargerVoltage=function(){
  var v=6.61207596594*analogRead(D2);
  //poke32(0x5000070c,2); // disconnect pin for power saving, otherwise it draws 70uA more
  return v;
};
function vibon(vib){
 if(vib.i>=1)D25.set();else analogWrite(D25,vib.i);
 setTimeout(viboff,vib.on,vib);
}
function viboff(vib){
 D25.reset();
 if (vib.c>1){vib.c=vib.c-1;setTimeout(vibon,vib.off,vib);}
}
exports.vibrate=function(intensity,count,onms,offms){
 vibon({i:intensity,c:count,on:onms,off:offms});
};

exports.initOLED=function(rot,f){
require("FontDennis8").add(Graphics);
require("Font8x16").add(Graphics);
var spi=SPI1; //new SPI()
spi.setup({mosi:D6,sck:D5,baud:8000000});

if (f===undefined) f=function(){
 o.gfx.setFontDennis8();
 o.gfx.drawString("Espruino on DS-D6",20,12);
 o.flip();
 setTimeout(() => {o.off();}, 3000);
};
if(rot===undefined) rot=270;
var o=require("DSD6OLED").connectSPI(spi,D28,D4,f,{cs:D29,rotation:rot});
exports.OLED=o;
};
});

var w=require("DSD6");
w.initOLED(270); // init and set to landscape mode
var o=w.OLED;

function setupSerial(s){
  if (!s) s = Serial1;
  s.setup(38400, {rx:D22,tx:D23});
}
function resumeConsole(s){
  setupSerial(s);
  setTimeout(() => {s.setConsole();}, 50);
}
function pauseConsole(s){
  if (!s) s=Serial1;
  if(s._options){
    Bluetooth.setConsole(1);
    setTimeout(() => {
      var rx = s._options.rx;
      s.unsetup();
      rx.mode("input_pulldown");
      setWatch(()=>{resumeConsole(s);},rx,{edge:'rising',debounce:30});}, 500);
  }
}

var model = {
  startDate: undefined,
  endDate: undefined,
  age: HRW_AGE,
  bpm: 0.0,
  rrArray: new Uint16Array(5002), // The 1st and 2nd array elts are reserved to store current index and count
  rrTotal: new Float64Array(3 * 7), // store sum of RRI values, rmssd precalculations and count of total RR intervals

  computeDuration: function(start, end) {
    if(start === undefined) {
      start = this.startDate;
    }
    if(start === undefined) {
      return "";
    }

    if(end === undefined) {
      end = this.endDate;
    }
    if(end === undefined) {
      end = Date.now();
    }
    const dd = (end - start) / 1000; // in seconds
    let h = ~~(dd / 3600);
    if(h <= 9) {
      h = "0" + h;
    }
    let m = ~~((dd % 3600) / 60);
    if(m <= 9) {
      m = "0" + m;
    }
    let s = ~~(dd % 60);
    if(s <= 9) {
      s = "0" + s;
    }
    return (h + ":" + m + ":" + s);
  },

  update: function(value) {
    // adapted from https://stackoverflow.com/a/52935617
    let offset = 1;

    if ((value.getUint8(0) & 0x01) === 0) {
        this.bpm = value.getUint8(1);
        offset = offset + 1; // plus 1 byte
    }
    else {
        let bpm = value.getUint16(1);
        this.bpm = (bpm >> 8) | ((bpm << 8) & 0xffff);
        offset =  offset + 2; // plus 2 bytes
    }

    // determine if RR-interval data are present //
    if ((value.getUint8(0) & (1 << 4)) !== 0)
    {
      const length = value.byteLength;
      const count = (length - offset) / 2;
      for(let idx = 0; idx < count; idx++) {
        let rrval = value.getUint16(offset + (idx * 2));
        rrval = (rrval >> 8) | ((rrval << 8) & 0xffff);
        this.addRRval(rrval);
      }
    }
  },

  addRRval: function(rrval) {
    const zone = this.computeBpmZone(this.computeBpm(rrval));
    this.rrTotal[3 * zone] += rrval;
    this.rrTotal[(3 * zone) + 2]++;

    if(this.rrArray[1] !== 0) {
      this.rrTotal[(3 * zone) + 1] += Math.pow((rrval - this.rrArray[2 + this.rrArray[0]]) / 1.024, 2);
      this.rrArray[0] = (this.rrArray[0] + 1) % (this.rrArray.length - 2);
    }
    if(this.rrArray[1] < this.rrArray.length - 2) {
      this.rrArray[1]++;
    }
    this.rrArray[2 + this.rrArray[0]] = rrval;
  },

  rrLength: function() {
    return this.rrArray[1];
  },

  computeTotalRRVal: function(zone, index) {
    if(index === undefined || index > 6) {
      index = 0;
    }

    if(zone === undefined) {
      let count = 0;
      for(let idx = 0; idx < 7; idx++) {
         count += this.rrTotal[(3 * idx) + index];
      }
      return count;
    }

    return this.rrTotal[(3 * zone) + index];
  },

  computeTotalRRValCount: function(zone) {
    return this.computeTotalRRVal(zone, 2);
  },

  computeTotalRMSSD: function(zone) {
    const count = this.computeTotalRRValCount(zone);
    if(count < 2) {
      return undefined;
    }

    return Math.sqrt(this.computeTotalRRVal(zone, 1) / (count - 1));
  },

  empty: function() {
    return (this.rrLength() === 0 && this.startDate === undefined);
  },

  reset: function() {
    this.startDate = undefined;
    this.endDate = undefined;
    this.bpm = 0.0;
    this.rrArray.fill(0);
    this.rrTotal.fill(0);
  },

  computeMaxHR: function(age) {
    return (220 - age);
  },

  computeBpm: function(rrval, count) {
    if(count === undefined) {
      count = 1;
    }

    return (60.0 * 1024.0 * count) / rrval;
  },

  computeBpmPc: function(bpm) {
    return 100.0 * (bpm / this.computeMaxHR(this.age));
  },

  // 7 zones : 0 (< 50%), 1 (50%-60%), 2 (60%-70%), 3 (70%-80%)
  //           4 (80%-90%), 5 (90%-100%), 6 (>= 100%)
  computeBpmZone: function(bpm) {
    const pc = this.computeBpmPc(bpm);
    if(pc < 50.0) {
      return 0;
    }
    if(pc >= 100.0) {
      return 6;
    }

    return ~~((pc - 40) / 10);
  },

  // compute HR (bpm) for "count" RR intervals.
  computeHR: function(count) {
    const length = this.rrArray[1];
    if(length === 0) {
      return 0.0;
    }
    if(count === undefined || count > length) {
      count = length;
    }

    let srrval = 0.0;
    for(let idx = 0; idx < count; idx++) {
      const locidx = (length + this.rrArray[0] - idx) % length;
      srrval += this.rrArray[2 + locidx];
    }

    return this.computeBpm(srrval, count);
  },

  // compute instantaneous heart rate
  computeIHR: function() {
    return this.computeHR(1);
  },

  computeAvgHR: function() {
    return this.computeBpm(this.computeTotalRRVal(), this.computeTotalRRValCount());
  },

  hrToString: function(hr, nbDigits, pcNbDigits) {
    if(isNaN(hr)) {
      return "N/A";
    }
    if(nbDigits === undefined) {
      nbDigits = 1;
    }
    if(pcNbDigits === undefined) {
      pcNbDigits = 1;
    }
    return (hr.toFixed(nbDigits).toString() + " " + model.computeBpmPc(hr).toFixed(pcNbDigits).toString()+ "%");
  },

  nbToString: function(nb, nbDigits) {
    if(isNaN(nb)) {
      return "N/A";
    }
    if(nbDigits === undefined) {
      nbDigits = 1;
    }
    return nb.toFixed(nbDigits).toString();
  },

  computeRMSSD: function(count) {
    let rmssd = 0.0;
    const length = this.rrArray[1];

    if(length < 2) {
      return rmssd;
    }
    if(count === undefined || count > length) {
      count = length;
    }

    for(let idx = 0; idx < count - 1; idx++) {
      const locidx = (length + this.rrArray[0] - idx) % length;
      const previdx = (length + locidx - 1) % length;
      rmssd += Math.pow((this.rrArray[2 + locidx] - this.rrArray[2 + previdx]) / 1.024, 2);
    }

    rmssd = Math.sqrt(rmssd / (count - 1));
    return rmssd;
  },

  computeSDNN: function(count) {
    let sdnn = 0.0;
    const length = this.rrArray[1];

    if(length < 2) {
      return sdnn;
    }
    if(count === undefined || count > length) {
      count = length;
    }

    let avg = 0.0;
    for(let idx = 0; idx < count; idx++) {
      const locidx = (length + this.rrArray[0] - idx) % length;
      avg += this.rrArray[2 + locidx];
    }

    avg /= count;

    for(let idx = 0; idx < count; idx++) {
      const locidx = (length + this.rrArray[0] - idx) % length;
      sdnn += Math.pow((this.rrArray[2 + locidx] - avg) / 1.024, 2);
    }

    sdnn = Math.sqrt(sdnn / (count - 1));
    return sdnn;
  },

  // how many RR intervals for a duration of "dur" seconds?
  computeNbRRVals: function(dur) {
    const length = this.rrArray[1];
    if(length === 0) {
      return 0.0;
    }

    let found = false;
    let count = 0;
    let srrval = 0.0;
    for(let idx = 0; idx < length; idx++) {
      const locidx = (length + this.rrArray[0] - idx) % length;
      const rrval = this.rrArray[2 + locidx] / 1024.0;
      srrval += rrval;
      if(srrval >= dur) {
        found = true;
        count += ((dur - (srrval - rrval)) / rrval);
        break;
      }
      count++;
    }

    if(!found) {
      return undefined;
    }

    return count;
  },
};

var gui = {
  panelIdx: 0,
  nextPanelIdx: 0,
  panelTimeout: undefined,
  timeoutId: -1,
  updatable: false,
  panels: { 0x00: [function() {this.drawTitle("welcome");}, false, 0x01],
            0x01: [function() {this.drawTitle("start");}, false, 0x02, 0x10],
            0x02: [function() {this.drawTitle("view");}, false, 0x03, 0x20],
            0x03: [function() {this.drawTitle("revert adv");}, false, 0x04, 0x30],
            0x04: [function() {this.drawTitle("reboot");}, false, 0x05, 0x40],
            0x05: [function() {this.drawTitle("off");}, false, 0x00, 0x50],
            0x10: [function() {connectToHRM(true);}, false, 0x11, 0x11, 1],
            0x11: [function() {this.drawHRPanel();}, true, 0x12],
            0x12: [function() {this.drawHRPanel();}, true, 0x13],
            0x13: [function() {this.drawHRPanel();}, true, 0x14],
            0x14: [function() {this.drawHRPanel();}, true, 0x15],
            0x15: [function() {this.drawHRPanel();}, true, 0x16],
            0x16: [function() {this.drawHRPanel();}, true, 0x17],
            0x17: [function() {this.drawHRPanel();}, true, 0x18],
            0x18: [function() {this.drawHRPanel();}, true, 0x19],
            0x19: [function() {this.drawHRPanel();}, true, 0x1a],
            0x1a: [function() {this.drawTitle("exit");}, false, 0x11, 0x1b],
            0x1b: [function() {disconnectHRM();}, false, 0x00, 0x00, 1],
            0x20: [function() {this.viewHRData();}, false, 0x00],
            0x30: [function() {revertBT();}, false, 0x00, 0x00, 1],
            0x40: [function() {E.reboot();}, false, 0x00],
            0x50: [function() {o.off();}, false, 0x00],
  },

  nextPanel: function(idx1, idx2, timeout) {
    if(idx2 !== undefined) {
      if(timeout === undefined) {
        if(this.panelTimeout === undefined) {
          this.panelTimeout = 6;
        }
        else if(this.panelTimeout > 0) {
          this.panelTimeout--;
        }
        else {
          this.panelTimeout = undefined;
        }
      }

      if(this.panelTimeout !== undefined) {
        this.timeoutId = setTimeout(() => {this.updatePanel(true); this.nextPanel(idx1, idx2, timeout);}, 1000);
      }
      else {
        if(timeout === undefined) {
          timeout = 1;
        }
        this.timeoutId = setTimeout(() => {this.nextPanelIdx = idx2; this.incPanel();}, timeout);
      }
    }
    this.nextPanelIdx = idx1;
  },

  drawTitle: function(title) {
    o.on();
    o.gfx.clear();
    o.gfx.setFontDennis8();
    const bv = w.battVoltage().toFixed(1).toString() + "V";
    let header = bv;
    if(this.panelTimeout !== undefined) {
      console.log("tout", this.panelTimeout);
      const end = (this.panelTimeout === 0) ? 0 : (this.panelTimeout - 1);
      header += " \x9a " + model.computeDuration(0.0, end * 1000.0);
    }
    header += " \x9a Adv: " + (adv_enabled ? "on" : "off");
    o.gfx.drawString(header, 0, 0);
    o.gfx.drawLine(0, 8,128, 8);
    o.gfx.setFontVector(22);
    o.gfx.drawString(title, 0, 9);
    o.flip();
  },

  viewHRData: function() {
    if(model.empty()) {
      this.drawTitle("no data!");
      this.nextPanel(0x1a);
    }
    else {
	this.nextPanel(0x11, 0x11, 1);
    }
  },
  
  drawHRPanel: function() {
    o.on();
    o.gfx.clear();
    const bpm = model.bpm;
    const bv = w.battVoltage().toFixed(1).toString() + "V";
    let header = bv + " \x9a " + model.computeDuration();
    if(this.panelIdx != 11) {
      header += " \x9a \x80 " + model.hrToString(bpm, 0, 0);
    }
    o.gfx.setFontDennis8();
    o.gfx.drawString(header, 0, 0);
    o.gfx.drawLine(0, 8,128, 8);
    switch(this.panelIdx) {
      case 0x11:
        o.gfx.setFontVector(20);
        o.gfx.drawString(model.hrToString(bpm, 0, 1), 0, 9);
        break;
      case 0x12: {
        o.gfx.setFont8x16();
        const ihr = model.computeIHR();
        const ahr = model.computeAvgHR();
        o.gfx.drawString("IHR: " + model.hrToString(ihr), 0, 9);
        o.gfx.drawString("HR AVG: " + model.hrToString(ahr), 0, 20); }
        break;
      case 0x13: {
        o.gfx.setFont8x16();
        const hr10 = 6.0 * model.computeNbRRVals(10);
        const hr60 = model.computeNbRRVals(60);
        o.gfx.drawString("HR 10s: " + model.hrToString(hr10), 0, 9);
        o.gfx.drawString("HR 60s: " + model.hrToString(hr60), 0, 20); }
        break;
      case 0x14: {
        o.gfx.setFont8x16();
        let rmssd5m = undefined;
        const nbRR = model.computeNbRRVals(300);
        if(nbRR !== undefined) {
          rmssd5m = model.computeRMSSD(Math.round(nbRR));
        }
        o.gfx.drawString("RMSSD 5m: " + model.nbToString(rmssd5m), 0, 9);
        o.gfx.drawString("ln(RMSSD): " + model.nbToString(Math.log(rmssd5m)), 0, 20); }
        break;
      case 0x15: {
        o.gfx.setFont8x16();
        const rmssd = model.computeRMSSD();
        o.gfx.drawString("RMSSD all: " + model.nbToString(rmssd), 0, 9);
        o.gfx.drawString("ln(RMSSD): " + model.nbToString(Math.log(rmssd)), 0, 20); }
        break;
      case 0x16: {
        o.gfx.setFont8x16();
        let sdnn5m = undefined;
        const nbRR = model.computeNbRRVals(300);
        if(nbRR !== undefined) {
          sdnn5m = model.computeSDNN(Math.round(nbRR));
        }
        const sdnn = model.computeSDNN();
        o.gfx.drawString("SDNN 5m: " + model.nbToString(sdnn5m), 0, 9);
        o.gfx.drawString("SDNN all: " + model.nbToString(sdnn), 0, 20); }
        break;
      case 0x17: {
        o.gfx.setFontDennis8();
        o.gfx.drawString("< 50%:   " + model.computeDuration(0, model.computeTotalRRVal(0) / 1.024), 0, 9);
        o.gfx.drawString("50%-60%: " + model.computeDuration(0, model.computeTotalRRVal(1) / 1.024), 0, 17);
        o.gfx.drawString("60%-70%: " + model.computeDuration(0, model.computeTotalRRVal(2) / 1.024), 0, 25); }
        break;
      case 0x18: {
        o.gfx.setFontDennis8();
        o.gfx.drawString("70%-80%: " + model.computeDuration(0, model.computeTotalRRVal(3) / 1.024), 0, 9);
        o.gfx.drawString("80%-90%: " + model.computeDuration(0, model.computeTotalRRVal(4) / 1.024), 0, 17);
        o.gfx.drawString("90%-100%: " + model.computeDuration(0, model.computeTotalRRVal(5) / 1.024), 0, 25); }
        break;
      case 0x19: {
        o.gfx.setFontDennis8();
        o.gfx.drawString(">= 100%: " + model.computeDuration(0, model.computeTotalRRVal(6) / 1.024), 0, 9);
        o.gfx.drawString("Nb RRI: " + model.computeTotalRRValCount(), 0, 17);
        o.gfx.drawString("Max HR: " + model.computeMaxHR(model.age), 0, 25); }
        break;
    }
    o.flip();
  },

  drawError: function(reason) {
    o.on();
    o.gfx.clear();
    o.gfx.setFontVector(10);
    o.gfx.drawString(reason, 0, 0);
    o.flip();
  },

  updatePanel: function(force) {
    if(force || this.updatable) {
      this.panels[this.panelIdx][0].call(this);
    }
  },

  incPanel: function() {
    if(this.timeoutId !== -1) {
      clearTimeout(this.timeoutId);
      this.timeoutId = -1;
    }
    this.panelTimeout = undefined;
    this.panelIdx = this.nextPanelIdx;
    let panel = this.panels[this.panelIdx];
    this.updatable = panel[1];
    let idx2 = undefined;
    if(panel.length > 3) {
      idx2 = panel[3];
    }
    let timeout = undefined;
    if(panel.length > 4) {
      timeout = panel[4];
    }
    this.nextPanel(panel[2], idx2, timeout);
    this.updatePanel(true);
  },

  reset: function() {
    this.panelIdx = 0;
    this.nextPanelIdx = 0;
    this.panelTimeout = undefined;
    this.timeoutId = -1;
    this.updatable = false;
  },
};

function connectToHRM(s) {
  NRF.connect(HRW_HRMONITOR_ADDR).then(function(g) {
    if(s !== undefined) {
      model.reset();
      model.startDate = Date.now();
    }
    gatt = g;
    gatt.device.on('gattserverdisconnected', function(reason) {
      if(reason !== 0x16) {
        gui.drawError("gdisconnected: " + reason);
        gatt = undefined;
        setTimeout(()=>{connectToHRM(undefined);}, 3000);
      }
    });
    return gatt.getPrimaryService(0x180d);
  }).then(function(service) {
    return service.getCharacteristic(0x2a37);
  }).then(function(characteristic) {
    characteristic.on('characteristicvaluechanged', function(event) {
      model.update(event.target.value);
      gui.updatePanel(false);
    });
    return characteristic.startNotifications();
  }).then(function() {
    console.log("Done!");
  }).catch(function(error) {
    gui.drawError(error);
    setTimeout(()=>{o.off();}, 3000);
    console.log(error);
  });
}

function disconnectHRM() {
  if(gatt !== undefined) {
    gatt.disconnect();
    gatt = undefined;
    model.endDate = Date.now();
  }
}

function revertBT() {
  adv_enabled = !adv_enabled;
  if(adv_enabled) {
    NRF.wake();
    E.lockConsole();
  }
  else {
    NRF.sleep();
  }
}

function buttonHandler(s) {
  console.log("pressed", o.isOn);

  if(!o.isOn) {
    gui.reset();
  }
  gui.incPanel();
}

setTimeout(() => {
  o.setContrast(10);
  setWatch(buttonHandler, BTN1, true);
}, 3000);

setupSerial();// first set to known state
// now pause serial console for power saving, it will be enabled when RX goes high
// it should be enough to connect to serial adapter
pauseConsole(Serial1);
