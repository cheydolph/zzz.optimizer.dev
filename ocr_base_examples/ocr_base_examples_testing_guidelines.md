# Testing Guidelines for OCR Parsing and Validation

When testing the OCR scanner for the ZZZ discs, the following examples are present in this folder `ocr_base_examples`:

 1. Phone screenshots, or screenshots directly from a phone running ZZZ
 2. Camera pics, or pictures taken from a phone camera of a monitor or TV running ZZZ

When validating the parsed OCR results of these screenshots, the following should be the *true* disc stat and substats results and should be used to validate the success of the OCR parsing, preparation, and validation used.

   1. phone_screenshot_1.jpg

   ```json
{
 "slot": "Drive1",
 "set": "Shining Aria",
 "rarity": "S",
 "level": 15,
 "mainStat": {
  "type": "HP",
  "value": 2200
 },
 "subStats": [
   {
    "type": "CRIT_Rate",
    "value": 2.4,
    "rolls": 1
   },
   {
    "type": "ATK%",
    "value": 9,
    "rolls": 3
   },
   {
    "type": "Anomaly_Proficiency",
    "value": 36,
    "rolls": 4
   },
   {
    "type": "DEF%",
    "value": 4.8,
    "rolls": 1
   }
  ]
 }
   ```

   2. phone_screenshot_2.jpg

   ```json
{
 "slot": "Drive1",
 "set": "Wuthering Salon",
 "rarity": "S",
 "level": 15,
 "mainStat": {
  "type": "HP",
  "value": 2200
 },
 "subStats": [
  {
   "type": "CRIT_Rate",
   "value": 2.4,
   "rolls": 1
  },
  {
   "type": "ATK%",
   "value": 6,
   "rolls": 2
  },
  {
   "type": "PEN",
   "value": 18,
   "rolls": 2
  },
  {
   "type": "Anomaly_Proficiency",
   "value": 27,
   "rolls": 3
  }
 ]
}
   ```

   3. phone_screenshot_3.jpg

```json
{
 "slot": "Drive1",
 "set": "Chaos Jazz",
 "rarity": "S",
 "level": 15,
 "mainStat": {
  "type": "HP",
  "value": 2200
 },
 "subStats": [
  {
    "type": "Anomaly_Proficiency",
    "value": 18,
    "rolls": 2
  },
  {
    "type": "CRIT_Rate",
    "value": 4.8,
    "rolls": 2
  },
  {
    "type": "HP%",
    "value": 9,
    "rolls": 3
  },
  {
    "type": "ATK%",
    "value": 3,
    "rolls": 1
  }
 ]
}
```

   4. camera_pic_1.jpg

```json
{
 "slot": "Drive1",
 "set": "Moonlight Lullaby",
 "rarity": "S",
 "level": 15,
 "mainStat": {
  "type": "HP",
  "value": 2200
 },
 "subStats": [
  {
    "type": "DEF%",
    "value": 14.4,
    "rolls": 3
  },
  {
    "type": "Anomaly_Proficiency",
    "value": 9,
    "rolls": 1
  },
  {
    "type": "CRIT_Rate",
    "value": 7.2,
    "rolls": 3
  },
  {
    "type": "CRIT_DMG",
    "value": 9.6,
    "rolls": 2
  }
 ]
}
```

   6. camera_pic_2.jpg

```json
{
 "slot": "Drive1",
 "set": "Freedom Blues",
 "rarity": "S",
 "level": 15,
 "mainStat": {
  "type": "HP",
  "value": 2200
 },
 "subStats": [
  {
    "type": "Anomaly_Proficiency",
    "value": 27,
    "rolls": 3
  },
  {
    "type": "ATK%",
    "value": 6,
    "rolls": 2
  },
  {
    "type": "ATK",
    "value": 38,
    "rolls": 2
  },
  {
    "type": "CRIT_DMG",
    "value": 4.8,
    "rolls": 1
  }
 ]
}
```

   8. camera_pic_3.jpg

```json
{
 "slot": "Drive1",
 "set": "Feathered Fate",
 "rarity": "S",
 "level": 15,
 "mainStat": {
  "type": "HP",
  "value": 2200
 },
 "subStats": [
  {
    "type": "CRIT_DMG",
    "value": 9.6,
    "rolls": 2
  },
  {
    "type": "CRIT_Rate",
    "value": 2.4,
    "rolls": 1
  },
  {
    "type": "Anomaly_Proficiency",
    "value": 27,
    "rolls": 3
  },
  {
    "type": "ATK%",
    "value": 6,
    "rolls": 2
  }
 ]
}
```

   10. camera_pic_4.jpg

```json
{
 "slot": "Drive1",
 "set": "Moonlight Lullaby",
 "rarity": "S",
 "level": 15,
 "mainStat": {
  "type": "HP",
  "value": 2200
 },
 "subStats": [
  {
    "type": "DEF%",
    "value": 14.4,
    "rolls": 3
  },
  {
    "type": "Anomaly_Proficiency",
    "value": 9,
    "rolls": 1
  },
  {
    "type": "CRIT_Rate",
    "value": 7.2,
    "rolls": 3
  },
  {
    "type": "CRIT_DMG",
    "value": 9.6,
    "rolls": 2
  }
 ]
}
```

   12. camera_pic_5.jpg

```json
{
 "slot": "Drive1",
 "set": "Freedom Blues",
 "rarity": "S",
 "level": 15,
 "mainStat": {
  "type": "HP",
  "value": 2200
 },
 "subStats": [
  {
    "type": "Anomaly_Proficiency",
    "value": 27,
    "rolls": 3
  },
  {
    "type": "ATK%",
    "value": 6,
    "rolls": 2
  },
  {
    "type": "ATK",
    "value": 38,
    "rolls": 2
  },
  {
    "type": "CRIT_DMG",
    "value": 4.8,
    "rolls": 1
  }
 ]
}
```

   14. camera_pic_6.jpg

```json
{
 "slot": "Drive1",
 "set": "Feathered Fate",
 "rarity": "S",
 "level": 15,
 "mainStat": {
  "type": "HP",
  "value": 2200
 },
 "subStats": [
  {
    "type": "CRIT_DMG",
    "value": 9.6,
    "rolls": 2
  },
  {
    "type": "CRIT_Rate",
    "value": 2.4,
    "rolls": 1
  },
  {
    "type": "Anomaly_Proficiency",
    "value": 27,
    "rolls": 3
  },
  {
    "type": "ATK%",
    "value": 6,
    "rolls": 2
  }
 ]
}
```

Again, these are the values which the implemented OCR workflow should equal at the end of its parsing.
