var LiteAPIPaymentProviderStripe = (function () {
  "use strict";
  function e(e, t, n, r) {
    return new (n || (n = Promise))(function (i, o) {
      function a(e) {
        try {
          l(r.next(e));
        } catch (e) {
          o(e);
        }
      }
      function s(e) {
        try {
          l(r.throw(e));
        } catch (e) {
          o(e);
        }
      }
      function l(e) {
        var t;
        e.done
          ? i(e.value)
          : ((t = e.value),
            t instanceof n
              ? t
              : new n(function (e) {
                  e(t);
                })).then(a, s);
      }
      l((r = r.apply(e, t || [])).next());
    });
  }
  "function" == typeof SuppressedError && SuppressedError;
  var t,
    n = "https://js.stripe.com/v3",
    r = /^https:\/\/js\.stripe\.com\/v3\/?(\?.*)?$/,
    i =
      "script was called but an existing script already exists in the document; existing script parameters will be used",
    o = function (e) {
      var t = document.createElement("script");
      t.src = "".concat(n).concat("");
      var r = document.head || document.body;
      if (!r)
        throw new Error(
          "Expected document.body not to be null. requires a <body> element.",
        );
      return (r.appendChild(t), t);
    },
    a = null,
    s = null,
    l = null,
    c = function (e) {
      return null !== a
        ? a
        : (a = new Promise(function (t, a) {
            if ("undefined" != typeof window && "undefined" != typeof document)
              if ((window.Stripe && e && console.warn(i), window.Stripe))
                t(window.Stripe);
              else
                try {
                  var c = (function () {
                    for (
                      var e = document.querySelectorAll(
                          'script[src^="'.concat(n, '"]'),
                        ),
                        t = 0;
                      t < e.length;
                      t++
                    ) {
                      var i = e[t];
                      if (r.test(i.src)) return i;
                    }
                    return null;
                  })();
                  if (c && e) console.warn(i);
                  else if (c) {
                    if (c && null !== l && null !== s) {
                      var d;
                      (c.removeEventListener("load", l),
                        c.removeEventListener("error", s),
                        null === (d = c.parentNode) ||
                          void 0 === d ||
                          d.removeChild(c),
                        (c = o()));
                    }
                  } else c = o();
                  ((l = (function (e, t) {
                    return function () {
                      window.Stripe
                        ? e(window.Stripe)
                        : t(new Error("not available"));
                    };
                  })(t, a)),
                    (s = (function (e) {
                      return function () {
                        e(new Error("Failed to load Stripe.js"));
                      };
                    })(a)),
                    c.addEventListener("load", l),
                    c.addEventListener("error", s));
                } catch (e) {
                  return void a(e);
                }
            else t(null);
          })).catch(function (e) {
            return ((a = null), Promise.reject(e));
          });
    },
    d = !1,
    u = function () {
      return (
        t ||
        (t = c(null).catch(function (e) {
          return ((t = null), Promise.reject(e));
        }))
      );
    };
  Promise.resolve()
    .then(function () {
      return u();
    })
    .catch(function (e) {
      d || console.warn(e);
    });
  return class {
    constructor(e, t) {
      ((this.publicKey = ""),
        (this.stripePaymentElementConfigDefault = {
          layout: {
            type: "accordion",
            defaultCollapsed: !1,
            radios: !0,
            spacedAccordionItems: !1,
          },
        }),
        (this.elementsConfigDefault = {
          appearance: {
            theme: "flat",
            variables: {
              fontFamily: ' "Gill Sans", sans-serif',
              fontLineHeight: "1.5",
              borderRadius: "10px",
              colorBackground: "#F6F8FA",
            },
            rules: {
              ".Block": {
                backgroundColor: "var(--colorBackground)",
                boxShadow: "none",
                padding: "12px",
              },
              ".Input": { padding: "12px" },
              ".Input:disabled, .Input--invalid:disabled": {
                color: "lightgray",
              },
              ".Tab": { padding: "10px 12px 8px 12px", border: "none" },
              ".Tab:hover": {
                border: "none",
                boxShadow:
                  "0px 1px 1px rgba(0, 0, 0, 0.03), 0px 3px 7px rgba(18, 42, 66, 0.04)",
              },
              ".Tab--selected, .Tab--selected:focus, .Tab--selected:hover": {
                border: "none",
                backgroundColor: "#fff",
                boxShadow:
                  "0 0 0 1.5px var(--colorPrimaryText), 0px 1px 1px rgba(0, 0, 0, 0.03), 0px 3px 7px rgba(18, 42, 66, 0.04)",
              },
              ".Label": { fontWeight: "500" },
            },
          },
        }),
        (this.liteAPIConfig = t),
        (this.stripePaymentElementConfig =
          this.stripePaymentElementConfigDefault),
        (this.elementsConfig = { clientSecret: this.liteAPIConfig.secretKey }),
        (this.publicKey = e));
    }
    handlePayment() {
      return e(this, void 0, void 0, function* () {
        try {
          (yield this.loadStripe(),
            yield this.createPaymentElement(this.liteAPIConfig.secretKey));
        } catch (e) {}
      });
    }
    handleReturn() {
      return e(this, void 0, void 0, function* () {
        var e;
        try {
          if ((yield this.loadStripe(), !this.stripe))
            throw new Error("stripe not loaded");
          const t =
            null !==
              (e = new URL(window.location).searchParams.get(
                "payment_intent_client_secret",
              )) && void 0 !== e
              ? e
              : "";
          if ("" != t) {
            const { error: e, paymentIntent: n } =
              yield this.stripe.retrievePaymentIntent(t);
            if (e) throw new Error("failed to retrieve payment intent");
          }
        } catch (e) {}
      });
    }
    loadStripe() {
      return e(this, void 0, void 0, function* () {
        if ("object" == typeof this.stripe) return;
        const e = this.publicKey,
          t = yield (function () {
            for (var e = arguments.length, t = new Array(e), n = 0; n < e; n++)
              t[n] = arguments[n];
            d = !0;
            var r = Date.now();
            return u().then(function (e) {
              return (function (e, t, n) {
                if (null === e) return null;
                var r = e.apply(void 0, t);
                return (
                  (function (e, t) {
                    e &&
                      e._registerWrapper &&
                      e._registerWrapper({
                        name: "stripe-js",
                        version: "3.3.0",
                        startTime: t,
                      });
                  })(r, n),
                  r
                );
              })(e, t, r);
            });
          })(e, { apiVersion: "2023-10-16" });
        if (null === t) throw new Error("failed to load stripe");
        this.stripe = t;
      });
    }
    createPaymentElement(t) {
      return e(this, void 0, void 0, function* () {
        if (!this.stripe) throw new Error("stripe not loaded");
        const t = document.createElement("form"),
          n = document.createElement("div");
        t.appendChild(n);
        const r = document.createElement("div");
        t.appendChild(r);
        const i = document.createElement("button");
        ((i.type = "submit"),
          i.classList.add("lp-submit-button"),
          (i.textContent = this.liteAPIConfig.submitButton.text));
        const o = document.createElement("div");
        (o.classList.add("lp-submit-button-wrapper"),
          o.appendChild(i),
          t.appendChild(o));
        const a = document.createElement("div");
        ((a.id = "st-error-message"), t.appendChild(a));
        const s = document.querySelector(this.liteAPIConfig.targetElement);
        if (!s) throw new Error("target element not found");
        s.appendChild(t);
        const l = this.stripe.elements(this.elementsConfig);
        l.create("payment", this.stripePaymentElementConfig).mount(r);
        const c = l.create("expressCheckout", {
          buttonType: { applePay: "buy", googlePay: "buy", paypal: "buynow" },
          wallets: { applePay: "always", googlePay: "always", paypal: "auto" },
          layout: "auto",
          buttonTheme: { applePay: "black" },
          buttonHeight: 55,
        });
        if ((c.mount(n), t)) {
          let n = !1;
          (t.addEventListener("submit", (t) =>
            e(this, void 0, void 0, function* () {
              var e;
              if (
                (t.preventDefault(),
                !n &&
                  ((n = !0),
                  i && Object.hasOwnProperty("disabled") && (i.disabled = !0),
                  this.stripe))
              ) {
                const { error: t } = yield this.stripe.confirmPayment({
                  elements: l,
                  confirmParams: { return_url: this.liteAPIConfig.returnUrl },
                });
                if (t) {
                  const r = document.getElementById("st-error-message");
                  return (
                    r &&
                      (r.innerHTML =
                        null !== (e = t.message) && void 0 !== e ? e : ""),
                    (n = !1),
                    void (
                      i &&
                      Object.hasOwnProperty("disabled") &&
                      (i.disabled = !1)
                    )
                  );
                }
              }
            }),
          ),
            c.on("confirm", () =>
              e(this, void 0, void 0, function* () {
                var e;
                const { error: t } = yield l.submit();
                if (!t && this.stripe) {
                  const { error: t } = yield this.stripe.confirmPayment({
                    elements: l,
                    confirmParams: { return_url: this.liteAPIConfig.returnUrl },
                  });
                  if (t) {
                    const n = document.getElementById("st-error-message");
                    n &&
                      (n.innerHTML =
                        null !== (e = t.message) && void 0 !== e ? e : "");
                  }
                }
              }),
            ));
        }
      });
    }
  };
})();
