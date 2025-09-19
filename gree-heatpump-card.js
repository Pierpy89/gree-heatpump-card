// gree-heatpump-card.js
class GreeHeatPumpSimpleCard extends HTMLElement {
  constructor() {
    super();
    this._dragging = false;
    this._modeLock = null;
    this._lockTimeout = null;
    this._lastValue = null;

    this._scale = 3;        // scala arco + container
    this._textScale = 1.5;  // scala testi interni
  }

  setConfig(config) {
    if (!config) throw new Error("Config mancante");
    this.config = {
      mode_entity: config.mode_entity,
      switch_entity: config.switch_entity,
      cold_entity: config.cold_entity,
      hot_entity: config.hot_entity,
      water_out_entity: config.water_out_entity || null,
      water_in_entity: config.water_in_entity || null,
      step: config.step || 0.5,
      min: config.min || 0,
      max: config.max || 100,
      ringColor: config.ringColor || "#5d6263",
      trackColor: config.trackColor || "#b1b4b5",
      offColor: config.offColor || "rgba(200,200,200,0.45)",
      title: config.title || null,
      title_size: config.title_size || "20px",
      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.content) {
      const s = this._scale;
      const ts = this._textScale;
      const titleBlock = this.config.title
        ? `<div id="card-title" class="card-title" style="font-size:${Number(this.config.title_size)}px; margin-bottom:8px;">${this.config.title}</div>`
        : "";

      this.innerHTML = `
        <style>
          ha-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            padding: 16px;
            box-sizing: border-box;
            border-radius: 12px;
            background: var(--card-background-color, white);
          }
          .arc-container {
            position: relative;
            width: ${160 * s}px;
            height: ${120 * s}px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .arc-svg { display: block; margin: 0 auto; }
          .arc-value-text {
            font-size: ${28 * ts}px;
            font-weight: 700;
            text-anchor: middle;
            dominant-baseline: middle;
            fill: #000;
          }
          .arc-label-text {
            font-size: ${12 * ts}px;
            text-anchor: middle;
            fill: #666;
          }
          .arc-extra {
            font-size: ${12 * ts}px;
            text-anchor: middle;
            fill: #666;
          }
          .arc-blocker {
            position: absolute;
            left: 0;
            bottom: 0;
            width: 100%;
            height: 40%;
            z-index: 10;
            pointer-events: all;
            display: flex;
            justify-content: center;
          }
          .buttons {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            gap: 20px;
            transform: translateY(20px);
          }
          .mode-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: #f0f0f0;
            color: #333;
            font-weight: 600;
            font-family: "Roboto", sans-serif;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          }
          .mode-btn:hover { transform: scale(1.1); }
          #btn-off.active { background: #9e9e9e; color: white; }
          #btn-cool.active { background: #2196f3; color: white; }
          #btn-heat.active { background: #ff9800; color: white; }
          .mode-btn .icon { font-size: 24px; margin-bottom: 4px; }
        </style>

        <ha-card>
          ${titleBlock}
          <div class="arc-container">
            <svg class="arc-svg" id="arc-svg" width="${160 * s}" height="${160 * s}" viewBox="0 0 ${200 * s} ${160 * s}">
              <g id="arc-group"></g>
              <text id="arc-value-text" class="arc-value-text" x="${100 * s}" y="${70 * s}" dy="-6">--</text>
              <text id="arc-label-text" class="arc-label-text" x="${100 * s}" y="${70 * s}" dy="${20 * ts}"></text>
              <text id="arc-extra1-text" class="arc-extra" x="${100 * s}" y="${70 * s}" dy="${38 * ts}"></text>
              <text id="arc-extra2-text" class="arc-extra" x="${100 * s}" y="${70 * s}" dy="${54 * ts}"></text>
            </svg>

            <div class="arc-blocker">
              <div class="buttons">
                <button class="mode-btn" id="btn-off">
                  <ha-icon icon="mdi:power"></ha-icon>
                  Off
                </button>
                <button class="mode-btn" id="btn-cool">
                  <ha-icon icon="mdi:snowflake"></ha-icon>
                  Cool
                </button>
                <button class="mode-btn" id="btn-heat">
                  <ha-icon icon="mdi:fire"></ha-icon>
                  Heat
                </button>
              </div>
            </div>
          </div>
        </ha-card>
      `;

      // riferimenti
      this.btnOff = this.querySelector("#btn-off");
      this.btnCool = this.querySelector("#btn-cool");
      this.btnHeat = this.querySelector("#btn-heat");
      this.$arcSvg = this.querySelector("#arc-svg");
      this.$arcGroup = this.querySelector("#arc-group");
      this.$valueText = this.querySelector("#arc-value-text");
      this.$labelText = this.querySelector("#arc-label-text");
      this.$extra1Text = this.querySelector("#arc-extra1-text");
      this.$extra2Text = this.querySelector("#arc-extra2-text");

      this.btnOff.addEventListener("click", () => this.setMode("off"));
      this.btnCool.addEventListener("click", () => this.setMode("cool"));
      this.btnHeat.addEventListener("click", () => this.setMode("heat"));

      this.$arcSvg.addEventListener("mousedown", (e) => this._startInteraction(e));
      this.$arcSvg.addEventListener("touchstart", (e) => this._startInteraction(e), { passive: false });
      document.addEventListener("mousemove", (e) => this._moveInteraction(e));
      document.addEventListener("touchmove", (e) => this._moveInteraction(e), { passive: false });
      document.addEventListener("mouseup", (e) => this._endInteraction(e));
      document.addEventListener("touchend", (e) => this._endInteraction(e));

      this.content = true;
    }
    this._updateFromState();
  }

  _getActiveMode() {
    if (!this._hass) return "off";
    const switchState = this._hass.states[this.config.switch_entity];
    if (!switchState || switchState.state === "off") return "off";
    const modeState = this._hass.states[this.config.mode_entity];
    if (!modeState) return "off";
    const state = modeState.state.toLowerCase();
    if (state === "cool") return "cool";
    if (state === "heat") return "heat";
    return "off";
  }

  async setMode(mode) {
    if (!this._hass) return;
    const map = { off: "Off", cool: "Cool", heat: "Heat" };
    if (!map[mode]) return;
    this._modeLock = mode;
    if (this._lockTimeout) clearTimeout(this._lockTimeout);
    this._lockTimeout = setTimeout(() => { this._modeLock = null; this._updateFromState(); }, 6000);
    try {
      if (mode === "off") await this._hass.callService("switch", "turn_off", { entity_id: this.config.switch_entity });
      else {
        await this._hass.callService("switch", "turn_on", { entity_id: this.config.switch_entity });
        await this._hass.callService("select", "select_option", { entity_id: this.config.mode_entity, option: map[mode] });
      }
    } catch (e) { console.error(e); }
    this._updateFromState();
  }

  async _setNumberValue(entity, value) {
    if (!this._hass || !entity) return;
    const domain = entity.split(".")[0];
    await this._hass.callService(domain, "set_value", { entity_id: entity, value: Number(value) });
  }

  _updateFromState() {
    const mode = this._modeLock || this._getActiveMode();

    // Aggiorna pulsanti
    this.btnOff.classList.toggle("active", mode === "off");
    this.btnCool.classList.toggle("active", mode === "cool");
    this.btnHeat.classList.toggle("active", mode === "heat");

    // Testo centrale
    if (mode === "off") this.$valueText.style.fill = "#666666";
    else if (mode === "cool") this.$valueText.style.fill = "#00aaff";
    else if (mode === "heat") this.$valueText.style.fill = "#ff8800";

    if (mode === "off") {
      this.$valueText.textContent = "Spento";
      this.$labelText.textContent = "";
      this.$extra1Text.textContent = "";
      this.$extra2Text.textContent = "";
      this._renderArc(0, true);
      return;
    }

    const entity = mode === "cool" ? this.config.cold_entity : this.config.hot_entity;
    const stateObj = this._hass.states[entity];
    const value = stateObj ? Number(stateObj.state) : NaN;
    const min = stateObj?.attributes?.min ?? this.config.min;
    const max = stateObj?.attributes?.max ?? this.config.max;

    if (!isNaN(value)) {
      this.$valueText.textContent = `🌡 ${value} °C`;
      this.$labelText.textContent = mode === "cool" ? "FREDDO" : "CALDO";
      const fraction = (value - min) / (max - min);
      this._renderArc(fraction);
    } else {
      this.$valueText.textContent = "--";
      this.$labelText.textContent = "";
      this._renderArc(0, true);
    }

    // Aggiorna extra labels
    if (this.config.water_out_entity && this._hass.states[this.config.water_out_entity]) {
      const outVal = this._hass.states[this.config.water_out_entity].state;
      this.$extra1Text.textContent = `⇢ Esterna: ${outVal} °C`;
      this.$extra1Text.style.fill = mode === "cool" ? "#ff8800" : "#00aaff";
    }

    if (this.config.water_in_entity && this._hass.states[this.config.water_in_entity]) {
      const inVal = this._hass.states[this.config.water_in_entity].state;
      this.$extra2Text.textContent = `⇠ Interna: ${inVal} °C`;
      this.$extra2Text.style.fill = mode === "cool" ? "#00aaff" : "#ff8800";
    }
  }

  _renderArc(fraction, disabled = false) {
    const s = this._scale;
    const strokeWidth = 10 * s;
    const radius = 50 * s;
    const centerX = 100 * s;
    const centerY = 70 * s;

    const angle = fraction * 270;
    const active = this._modeLock || this._getActiveMode();
    let arcColor;
    if (disabled) arcColor = "#aaa";
    else if (active === "cool") arcColor = "#00aaff";
    else if (active === "heat") arcColor = "#ff8800";
    else arcColor = this.config.trackColor;

    const startAngle = 135;
    const endAngle = 405;
    const startRadians = (startAngle - 90) * (Math.PI / 180);
    const endRadians = (endAngle - 90) * (Math.PI / 180);
    const startX = centerX + radius * Math.cos(startRadians);
    const startY = centerY + radius * Math.sin(startRadians);
    const endX = centerX + radius * Math.cos(endRadians);
    const endY = centerY + radius * Math.sin(endRadians);
    const largeArcFlag = 1;

    const trackPath = `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`;
    const valueAngle = startAngle + angle;
    const valueRadians = (valueAngle - 90) * (Math.PI / 180);
    const valueX = centerX + radius * Math.cos(valueRadians);
    const valueY = centerY + radius * Math.sin(valueRadians);
    const valueLargeArcFlag = angle > 180 ? 1 : 0;
    const valuePath = `M ${startX} ${startY} A ${radius} ${radius} 0 ${valueLargeArcFlag} 1 ${valueX} ${valueY}`;

    this.$arcGroup.innerHTML = `
      <g transform="rotate(90 ${centerX} ${centerY})">
        <path d="${trackPath}" stroke="${disabled ? "#ccc" : this.config.trackColor}" stroke-width="${strokeWidth}" fill="none" opacity="0.3" stroke-linecap="round"/>
        <path d="${valuePath}" stroke="${arcColor}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" style="transition: stroke-dasharray 0.2s, stroke 0.2s;"/>
      </g>
    `;
  }

  _startInteraction(evt) { if (this._getActiveMode() === "off") return; this._dragging = true; this._onInteraction(evt); evt.preventDefault(); }
  _moveInteraction(evt) { if (!this._dragging) return; this._onInteraction(evt); evt.preventDefault(); }
  _endInteraction(evt) { if (!this._dragging) return; this._dragging = false; const active = this._modeLock || this._getActiveMode(); if (active === "off") return; const entity = active === "cool" ? this.config.cold_entity : this.config.hot_entity; if (this._lastValue !== null) this._setNumberValue(entity, this._lastValue); }

  _onInteraction(evt) {
    const e = evt.touches ? evt.touches[0] : evt;
    const svgRect = this.$arcSvg.getBoundingClientRect();
    const s = this._scale;
    const x = e.clientX - svgRect.left;
    const y = e.clientY - svgRect.top;
    const xViewBox = (x / svgRect.width) * (200 * s);
    const yViewBox = (y / svgRect.height) * (160 * s);

    const centerX = 100 * s;
    const centerY = 70 * s;
    const dx = xViewBox - centerX;
    const dy = yViewBox - centerY;
    const rotatedDx = dy;
    const rotatedDy = -dx;
    let angle = Math.atan2(rotatedDy, rotatedDx);
    let angleDegrees = ((angle * 180 / Math.PI + 360) % 360) + 90;
    if (angleDegrees < 135) angleDegrees += 360;
    let fraction = (angleDegrees - 135) / 270;
    fraction = Math.max(0, Math.min(1, fraction));

    const active = this._modeLock || this._getActiveMode();
    if (active === "off") return;
    const entity = active === "cool" ? this.config.cold_entity : this.config.hot_entity;
    const stateObj = this._hass.states[entity];
    const min = stateObj?.attributes?.min ?? this.config.min;
    const max = stateObj?.attributes?.max ?? this.config.max;

    let value = fraction * (max - min) + min;
    const step = this.config.step || 1;
    value = Math.round(value / step) * step;
    value = Math.min(Math.max(value, min), max);

    this._lastValue = value;
    this._renderArc(fraction);
    this.$valueText.textContent = `🌡 ${value} °C`;
    this.$labelText.textContent = active === "cool" ? "FREDDO" : "CALDO";
  }

  static getStubConfig() {
    return {
      type: "custom:gree-heatpump-card",
      mode_entity: "",
      switch_entity: "",
      cold_entity: "",
      hot_entity: "",
      water_out_entity: "",
      water_in_entity: "",
    };
  }
}

customElements.define("gree-heatpump-card", GreeHeatPumpSimpleCard);
