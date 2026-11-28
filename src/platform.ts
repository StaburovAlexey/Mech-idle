import { PauseManager } from './persistence';
/** Local lifecycle adapter only. No advertising SDK, analytics or cloud saves. */
export class LocalPlatformAdapter {
 ready=false; playing=false;
 async init(){this.ready=true;}
 gameReady(){this.ready=true;}
 gameplayStart(){this.playing=true;}
 gameplayStop(){this.playing=false;}
 // Pages has no real ad provider. Permit reward-flow testing only in development.
 get resultAdAvailable(){return import.meta.env.DEV;}
 async showResultAd(pause: PauseManager){
  return this.resultAdAvailable ? this.mockAd(pause) : 'cancel';
 }
 async mockAd(pause:PauseManager,outcome:'success'|'cancel'|'error'='success'){
  pause.add('platformAd');
  try {if(outcome==='error')throw new Error('Mock ad error');return outcome;}finally{pause.remove('platformAd');}
 }
}
