# Gree Heat Pump Card

Custom Lovelace card per controllare pompe di calore Gree.  
Supporta la visualizzazione di set point, modalità (Off, Cool, Heat) e temperature acqua in ingresso/uscita.

---

## Installazione

1. Vai su **HACS → Frontend → Custom repositories**
2. Inserisci il link della repository: `https://github.com/Pierpy89/gree-heatpump-card`
3. Scegli tipo: **Plugin**
4. Installa la card
5. Riavvia Home Assistant

---

## Esempio YAML

```yaml
type: 'custom:gree-heatpump-card'
title: "Pompa di calore"
title_size: 40        # dimensione font titolo
mode_entity: sensor.gree_mode
switch_entity: switch.gree_power
cold_entity: sensor.gree_cold
hot_entity: sensor.gree_hot
water_out_entity: sensor.gree_heat_pump_192_168_20_141_water_out_pe
water_in_entity: sensor.gree_heat_pump_192_168_20_141_water_in_pe
step: 0.5
min: 5
max: 40
ringColor: "#5d6263"
trackColor: "#b1b4b5"
offColor: "rgba(200,200,200,0.45)"
