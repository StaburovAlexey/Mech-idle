export const SETTINGS_KEY = 'oplot.settings.v1';
export type GameSettings = { sound: boolean; volume: number; crt: boolean };

export function readGameSettings(): GameSettings {
 try {
  const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
  return {
   sound:saved?.sound===true,
   volume:typeof saved?.volume==='number'&&Number.isFinite(saved.volume)?Math.round(Math.max(0,Math.min(100,saved.volume))):100,
   crt:saved?.crt!==false,
  };
 }catch{return {sound:false,volume:100,crt:true};}
}

export function saveGameSettings(settings: GameSettings) {
 try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{/* Settings still apply for this session. */}
}

export const gameSettingsMarkup=`<div class="chain-settings" id="game-settings-controls">
 <label class="settings-row"><span>Звук</span><input name="sound" type="checkbox" role="switch"></label>
 <label class="settings-row settings-volume"><span>Громкость</span><output></output><input name="volume" type="range" min="0" max="100" step="1"></label>
 <label class="settings-row"><span>Эффект CRT</span><input name="crt" type="checkbox" role="switch" aria-describedby="crt-help"></label>
 <p id="crt-help">Слегка выгибает экран во всей игре, как у лампового телевизора. Без ряби.</p>
</div>`;

export function bindGameSettings(panel: HTMLElement, settings: GameSettings, changed: ()=>void) {
 const sound=panel.querySelector<HTMLInputElement>('[name=sound]')!;
 const volume=panel.querySelector<HTMLInputElement>('[name=volume]')!;
 const crt=panel.querySelector<HTMLInputElement>('[name=crt]')!;
 const readout=panel.querySelector<HTMLOutputElement>('output')!;
 sound.checked=settings.sound;volume.value=String(settings.volume);crt.checked=settings.crt;
 readout.value=`${settings.volume}%`;
 sound.onchange=()=>{settings.sound=sound.checked;changed();};
 crt.onchange=()=>{settings.crt=crt.checked;changed();};
 volume.oninput=()=>{settings.volume=Number(volume.value);readout.value=`${volume.value}%`;changed();};
}
