export const SETTINGS_KEY = 'oplot.settings.v1';
export type GameSettings = { sound: boolean; volume: number };

export function readGameSettings(): GameSettings {
 try {
  const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
  return {
   sound:saved?.sound===true,
   volume:typeof saved?.volume==='number'&&Number.isFinite(saved.volume)?Math.round(Math.max(0,Math.min(100,saved.volume))):100,
  };
 }catch{return {sound:false,volume:100};}
}

export function saveGameSettings(settings: GameSettings) {
 try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{/* Settings still apply for this session. */}
}

export const gameSettingsMarkup=`<div class="chain-settings" id="game-settings-controls">
 <label class="settings-row"><span>Звук</span><input name="sound" type="checkbox" role="switch"></label>
 <label class="settings-row settings-volume"><span>Громкость</span><output></output><input name="volume" type="range" min="0" max="100" step="1"></label>
</div>`;

export function bindGameSettings(panel: HTMLElement, settings: GameSettings, changed: ()=>void) {
 const sound=panel.querySelector<HTMLInputElement>('[name=sound]')!;
 const volume=panel.querySelector<HTMLInputElement>('[name=volume]')!;
 const readout=panel.querySelector<HTMLOutputElement>('output')!;
 sound.checked=settings.sound;volume.value=String(settings.volume);
 readout.value=`${settings.volume}%`;
 sound.onchange=()=>{settings.sound=sound.checked;changed();};
 volume.oninput=()=>{settings.volume=Number(volume.value);readout.value=`${volume.value}%`;changed();};
}
