# Vanguard Ethics & Risk Classifier

A one-vs-rest LinearSVC over TF-IDF, trained in Python and exported as JSON.
Detects six named policy-violation categories in a prompt, on-device, in under a millisecond.

## Measured (2026-07-20)

```
category                      precision   recall  threshold
covert_surveillance               1.000    1.000    -0.3145
undisclosed_profiling             1.000    1.000    -0.0253
discriminatory_screening          1.000    1.000     0.3643
security_evasion                  1.000    1.000     0.0759
harassment_content                1.000    1.000    -0.1796
regulatory_circumvention          1.000    1.000     0.3805
```

hard-negative gate:
  clean — 34 hard negatives, none fired

PASS
