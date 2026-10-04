export class Sound {
 enabled=false;private ctx:AudioContext|null=null;
 toggle(){this.enabled=!this.enabled;if(this.enabled){this.ctx??=new AudioContext();void this.ctx.resume();}return this.enabled;}
 play(kind:'shot'|'kill'|'upgrade'|'wave'){
  if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
  const ctx=this.ctx,osc=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime;
  osc.type=kind==='shot'?'triangle':'sine';
  const notes={shot:160,kill:70,upgrade:500,wave:720};
  osc.frequency.setValueAtTime(notes[kind],t);osc.frequency.exponentialRampToValueAtTime(kind==='upgrade'?850:35,t+.12);
  gain.gain.setValueAtTime(kind==='shot'?.025:.06,t);gain.gain.exponentialRampToValueAtTime(.001,t+.15);
  osc.connect(gain);gain.connect(ctx.destination);osc.start(t);osc.stop(t+.16);
 }
 suspend(){if(this.ctx?.state==='running')void this.ctx.suspend();}resume(){if(this.enabled&&this.ctx?.state==='suspended')void this.ctx.resume();}
}
