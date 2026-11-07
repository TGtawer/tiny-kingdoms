import { initI18n, getLang, type Lang } from '../i18n/i18n';
import type { SaveStore } from '../save/SaveStore';
import { isMusicEnabled, setMusicEnabled, setMusicVolume } from '../view/music';
import type { SettingsChannel, SettingsModel } from '../view/SettingsPanel';
import { isSoundEnabled, setSoundEnabled, setSoundVolume } from '../view/sound';

/**
 * Applies and saves player settings in one place, so the menu and the battle pause stay in step.
 */

/** Switches the language at once and remembers it; it then wins over the platform's language on every start. */
export function setLang(store: SaveStore, lang: Lang): void {
  initI18n(lang);
  store.settings.lang = lang;
  store.commit();
}

/**
 * The settings panel's view of the save: on/off and volume per channel, the language.
 * `onLang` switches the language where the screen can redraw itself (the menu); without it the panel has no
 * language row (the battle pause).
 */
export function settingsModel(store: SaveStore, onLang?: (lang: Lang) => void): SettingsModel {
  const s = store.settings;
  const apply = (channel: SettingsChannel): void => {
    // Switch only on a change: switching the music on again restarts its fade-in.
    if (channel === 'sound') {
      if (isSoundEnabled() !== s.sound) setSoundEnabled(s.sound);
      setSoundVolume(s.soundVolume);
    } else {
      if (isMusicEnabled() !== s.music) setMusicEnabled(s.music);
      setMusicVolume(s.musicVolume);
    }
  };
  return {
    isOn: (channel) => (channel === 'sound' ? s.sound : s.music),
    volume: (channel) => (channel === 'sound' ? s.soundVolume : s.musicVolume),
    setOn: (channel, on) => {
      if (channel === 'sound') s.sound = on;
      else s.music = on;
      apply(channel);
      store.commit();
    },
    // Moving the slider of a channel that is off turns it on; the volume is kept while it is off.
    setVolume: (channel, v) => {
      if (channel === 'sound') {
        s.soundVolume = v;
        s.sound = true;
      } else {
        s.musicVolume = v;
        s.music = true;
      }
      apply(channel);
    },
    commit: () => store.commit(),
    lang: () => getLang(),
    ...(onLang ? { setLang: onLang } : {}),
  };
}
