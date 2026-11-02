# Third-party model: ocrs text recognition

`text-recognition.onnx` is the text-recognition model of **ocrs** by Robert Knight
(https://github.com/robertknight/ocrs; models trained in
https://github.com/robertknight/ocrs-models, published at
https://huggingface.co/robertknight/ocrs — file `text-rec-checkpoint-s52qdbqt.onnx`,
commit `df0edd170279`).

- **Licence:** Creative Commons Attribution-ShareAlike 4.0 International
  (CC BY-SA 4.0), https://creativecommons.org/licenses/by-sa/4.0/. Permission to
  use it in the tracker was given by Turbozo (2026-11-01, #glorg-chat: "we have
  permission to use the ocr model"); the terms above are the model's own.
- **Training data:** HierText (CC BY-SA 4.0) and synthetic data.
- **Modified:** no. The file is bundled unmodified (9,713,787 bytes,
  SHA-256 `3774cdfe8ba082a17c181d5ab0698f3ff2fd0def07cd2b9134faec9b1a191919`).
- **No warranty:** the model is provided "as is", without warranties of any
  kind, as set out in sections 5 and 6 of the licence.

This notice covers the model file only. The ocrs code our `core/ocrmodel.js`
ports from is MIT (Robert Knight, github.com/robertknight/ocrs), and the port is
ours. If the model is ever fine-tuned, the tuned model must also be released
under CC BY-SA 4.0.

The same model file (an earlier build of it) is what Minerva
(github.com/itechify/minerva) bundles for its own readers; our use is
independent and covered by this notice.
