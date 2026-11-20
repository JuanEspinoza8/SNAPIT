import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Contraste de WCAG 2 entre dos colores.
double contraste(Color a, Color b) {
  final clara = math.max(a.computeLuminance(), b.computeLuminance());
  final oscura = math.min(a.computeLuminance(), b.computeLuminance());
  return (clara + 0.05) / (oscura + 0.05);
}
