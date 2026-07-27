import React from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import styles from './LanguageModal.module.css';

const LANGUAGES = [
  { code: 'en-US', name: 'English (US)', flag: 'https://flagcdn.com/w40/us.png' },
  { code: 'hi-IN', name: 'हिन्दी', flag: 'https://flagcdn.com/w40/in.png' },
  { code: 'en-GB', name: 'English (UK)', flag: 'https://flagcdn.com/w40/gb.png' },
  { code: 'es-ES', name: 'Español', flag: 'https://flagcdn.com/w40/es.png' },
  { code: 'fr-FR', name: 'Français', flag: 'https://flagcdn.com/w40/fr.png' },
  { code: 'de-DE', name: 'Deutsch', flag: 'https://flagcdn.com/w40/de.png' },
  { code: 'it-IT', name: 'Italiano', flag: 'https://flagcdn.com/w40/it.png' },
  { code: 'nl-NL', name: 'Nederlands', flag: 'https://flagcdn.com/w40/nl.png' },
  { code: 'ja-JP', name: '日本語', flag: 'https://flagcdn.com/w40/jp.png' },
  { code: 'zh-CN', name: '简体中文', flag: 'https://flagcdn.com/w40/cn.png' },
  { code: 'ko-KR', name: '한국어', flag: 'https://flagcdn.com/w40/kr.png' },
  { code: 'ar-SA', name: 'العربية', flag: 'https://flagcdn.com/w40/sa.png' },
  { code: 'pt-BR', name: 'Português (BR)', flag: 'https://flagcdn.com/w40/br.png' },
  { code: 'tr-TR', name: 'Türkçe', flag: 'https://flagcdn.com/w40/tr.png' },
  { code: 'ru-RU', name: 'Русский', flag: 'https://flagcdn.com/w40/ru.png' },
  { code: 'id-ID', name: 'Bahasa Indonesia', flag: 'https://flagcdn.com/w40/id.png' },
  { code: 'ms-MY', name: 'Bahasa Malaysia', flag: 'https://flagcdn.com/w40/my.png' },
  { code: 'th-TH', name: 'ภาษาไทย', flag: 'https://flagcdn.com/w40/th.png' },
  { code: 'vi-VN', name: 'Tiếng Việt', flag: 'https://flagcdn.com/w40/vn.png' },
  { code: 'pl-PL', name: 'Polski', flag: 'https://flagcdn.com/w40/pl.png' },
];

export default function LanguageModal({ isOpen, onClose, selectedLanguage, onSelect }) {
  if (!isOpen) return null;

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Select your language</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            <X size={24} />
          </button>
        </div>

        <div className={styles.grid}>
          {LANGUAGES.map((lang) => {
            const isSelected = selectedLanguage === lang.code;
            return (
              <button
                key={lang.code}
                className={`${styles.item} ${isSelected ? styles.itemSelected : ''}`}
                onClick={() => {
                  onSelect(lang.code, lang.flag);
                  onClose();
                }}
              >
                <div className={styles.itemInner}>
                  <img
                    src={lang.flag}
                    alt={lang.name}
                    className={styles.flag}
                    loading="lazy"
                  />
                  <span className={styles.name}>{lang.name}</span>
                </div>
                {isSelected && <Check size={18} className={styles.checkmark} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
