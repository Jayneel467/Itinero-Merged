import React from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import { MODAL_LANGUAGES, modalSelectionCode } from '@/constants/languages';
import styles from './LanguageModal.module.css';

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
          {MODAL_LANGUAGES.map((lang) => {
            const isSelected = modalSelectionCode(selectedLanguage) === lang.code;
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
