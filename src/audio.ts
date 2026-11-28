export class Sound {
 enabled=false;
 private ctx:AudioContext|null=null;
 private master:GainNode|null=null;
 private level=1;
 get volume(){return this.level;}
 set volume(value:number){this.level=value;if(this.master)this.master.gain.value=value;}
 unlock(){
  if(!this.enabled||this.ctx||typeof AudioContext==='undefined')return;
  this.ctx=new AudioContext();
  this.master=this.ctx.createGain();this.master.gain.value=this.level;this.master.connect(this.ctx.destination);
 }
 play(kind:'shot'|'kill'|'upgrade'|'wave'){
  if(!this.enabled||!this.ctx||!this.master||this.ctx.state!=='running')return;
  const ctx=this.ctx,osc=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime;
  osc.type=kind==='shot'?'triangle':'sine';
  const notes={shot:160,kill:70,upgrade:500,wave:720};
  osc.frequency.setValueAtTime(notes[kind],t);osc.frequency.exponentialRampToValueAtTime(kind==='upgrade'?850:35,t+.12);
  gain.gain.setValueAtTime(kind==='shot'?.025:.06,t);gain.gain.exponentialRampToValueAtTime(.001,t+.15);
  osc.connect(gain);gain.connect(this.master);osc.start(t);osc.stop(t+.16);
 }
 suspend(){if(this.ctx?.state==='running')void this.ctx.suspend();}resume(){if(this.enabled&&this.ctx?.state==='suspended')void this.ctx.resume();}
}
