/**
 * chat.js — Chat window rendering and input handling.
 */

const Chat = (() => {
  const chatWindow  = () => document.getElementById('chat-window');
  const chatInput   = () => document.getElementById('chat-input');
  const btnSend     = () => document.getElementById('btn-send');

  let _typingEl = null;

  // ─── Public: render a message bubble ──────────────────────────────────────

  /**
   * Append a message to the chat window.
   * @param {'user'|'assistant'} role
   * @param {string} text  - plain text or markdown (for assistant)
   */
  function addMessage(role, text) {
    const win = chatWindow();
    if (!win) return;

    // Remove typing indicator if present
    removeTyping();

    const wrap = document.createElement('div');
    wrap.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = role === 'user' ? '👤' : '🤖';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (role === 'assistant' && typeof marked !== 'undefined') {
      // Render markdown safely
      bubble.innerHTML = marked.parse(text || '');
    } else {
      bubble.textContent = text || '';
    }

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    win.appendChild(wrap);
    _scrollToBottom(win);
    return wrap;
  }

  // ─── Typing indicator ─────────────────────────────────────────────────────

  function showTyping() {
    const win = chatWindow();
    if (!win || _typingEl) return;

    _typingEl = document.createElement('div');
    _typingEl.className = 'message assistant typing-indicator';
    _typingEl.innerHTML = `
      <div class="avatar" aria-hidden="true">🤖</div>
      <div class="bubble">
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>`;
    win.appendChild(_typingEl);
    _scrollToBottom(win);
  }

  function removeTyping() {
    if (_typingEl) {
      _typingEl.remove();
      _typingEl = null;
    }
  }

  // ─── Input management ─────────────────────────────────────────────────────

  function clearInput() {
    const inp = chatInput();
    if (inp) { inp.value = ''; _autoResize(inp); }
  }

  function setInputDisabled(disabled) {
    const inp = chatInput();
    const btn = btnSend();
    if (inp) inp.disabled = disabled;
    if (btn) btn.disabled = disabled;
  }

  function focusInput() {
    const inp = chatInput();
    if (inp) inp.focus();
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  function _scrollToBottom(el) {
    el.scrollTop = el.scrollHeight;
  }

  function _autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 140) + 'px';
  }

  // ─── Init: wire up input events ───────────────────────────────────────────

  function init(onSend) {
    const inp = chatInput();
    const btn = btnSend();
    if (!inp || !btn) return;

    // Auto-resize textarea as user types
    inp.addEventListener('input', () => _autoResize(inp));

    // Send on Enter (not Shift+Enter)
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _triggerSend(onSend);
      }
    });

    btn.addEventListener('click', () => _triggerSend(onSend));
  }

  function _triggerSend(onSend) {
    const inp = chatInput();
    if (!inp) return;
    const text = inp.value.trim();
    if (!text) return;
    clearInput();
    onSend(text);
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return { init, addMessage, showTyping, removeTyping, clearInput, setInputDisabled, focusInput };
})();
