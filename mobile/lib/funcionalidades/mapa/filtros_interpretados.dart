import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/formato/fechas.dart';
import '../../compartido/tema/tema_app.dart';
import 'consulta_interpretada.dart';
import 'estados.dart';
import 'filtros_mapa.dart';
import 'modelos.dart';
import 'repositorio_mapa.dart';

Future<FiltrosMapa?> elegirFiltrosInterpretados(
  BuildContext context,
  ConsultaInterpretada consulta,
) {
  return showModalBottomSheet<FiltrosMapa>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => _HojaFiltrosInterpretados(consulta),
  );
}

enum _Campo { categoria, estado, desde, hasta, barrio }

class _HojaFiltrosInterpretados extends ConsumerStatefulWidget {
  const _HojaFiltrosInterpretados(this.consulta);

  final ConsultaInterpretada consulta;

  @override
  ConsumerState<_HojaFiltrosInterpretados> createState() =>
      _HojaFiltrosInterpretadosState();
}

class _HojaFiltrosInterpretadosState
    extends ConsumerState<_HojaFiltrosInterpretados> {
  late FiltrosMapa _filtros = widget.consulta.filtros;
  _Campo? _editando;

  static final _primerDia = DateTime(2020);

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final hoy = DateUtils.dateOnly(DateTime.now());
    final categorias = ref.watch(categoriasProvider);
    final barrios = ref.watch(barriosProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(Espacio.lg, 0, Espacio.lg, Espacio.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Revisá los filtros', style: tema.textTheme.titleMedium),
          const SizedBox(height: Espacio.sm),
          Text(widget.consulta.descripcion, style: tema.textTheme.bodyMedium),
          const SizedBox(height: Espacio.lg),
          Wrap(
            spacing: Espacio.sm,
            runSpacing: Espacio.sm,
            children: [
              if (_filtros.categoriaId case final id?)
                InputChip(
                  label: Text(
                    'Categoría: ${_nombreCategoria(categorias.value, id)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  onPressed: () =>
                      setState(() => _editando = _Campo.categoria),
                  onDeleted: () => setState(
                    () => _filtros = _filtros.copyWith(categoriaId: null),
                  ),
                ),
              if (_filtros.estado case final estado?)
                InputChip(
                  label: Text(
                    'Estado: ${estado.etiqueta}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  onPressed: () => setState(() => _editando = _Campo.estado),
                  onDeleted: () =>
                      setState(() => _filtros = _filtros.copyWith(estado: null)),
                ),
              if (_filtros.barrio case final barrio?)
                InputChip(
                  label: Text(
                    'Barrio: $barrio',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  onPressed: () => setState(() => _editando = _Campo.barrio),
                  onDeleted: () =>
                      setState(() => _filtros = _filtros.copyWith(barrio: null)),
                ),
              if (_filtros.desde case final desde?)
                InputChip(
                  label: Text(
                    'Desde: ${fechaCorta(desde)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  onPressed: () => setState(() => _editando = _Campo.desde),
                  onDeleted: () =>
                      setState(() => _filtros = _filtros.copyWith(desde: null)),
                ),
              if (_filtros.hasta case final hasta?)
                InputChip(
                  label: Text(
                    'Hasta: ${fechaCorta(hasta)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  onPressed: () => setState(() => _editando = _Campo.hasta),
                  onDeleted: () =>
                      setState(() => _filtros = _filtros.copyWith(hasta: null)),
                ),
            ],
          ),
          if (_filtros.cantidadActivos == 0)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: Espacio.md),
              child: Text(
                'Sin filtros: se mostrarán todos los incidentes de la zona.',
                style: tema.textTheme.bodyMedium,
              ),
            ),
          if (_editando != null) ...[
            const Divider(height: Espacio.xl),
            _editor(categorias, barrios, hoy),
            const SizedBox(height: Espacio.lg),
          ],
          const SizedBox(height: Espacio.lg),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(_filtros),
            child: const Text('Buscar con estos filtros'),
          ),
          const SizedBox(height: Espacio.sm),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancelar'),
          ),
        ],
      ),
    );
  }

  String _nombreCategoria(List<Categoria>? categorias, int id) =>
      categorias?.where((c) => c.id == id).map((c) => c.nombre).firstOrNull ??
      '$id';

  Widget _editor(
    AsyncValue<List<Categoria>> categorias,
    AsyncValue<List<String>> barrios,
    DateTime hoy,
  ) {
    return switch (_editando!) {
      _Campo.categoria => _selectorCategoria(categorias),
      _Campo.estado => DropdownButtonFormField<EstadoVisible?>(
          isExpanded: true,
          initialValue: _filtros.estado,
          decoration: const InputDecoration(labelText: 'Estado'),
          items: [
            const DropdownMenuItem(value: null, child: Text('Todos')),
            for (final estado in EstadoVisible.values)
              DropdownMenuItem(
                value: estado,
                child: Text(estado.etiqueta, overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: (estado) =>
              setState(() => _filtros = _filtros.copyWith(estado: estado)),
        ),
      _Campo.barrio => _selectorBarrio(barrios),
      _Campo.desde => CampoFecha(
          etiqueta: 'Desde',
          valor: _filtros.desde,
          primerDia: _primerDia,
          ultimoDia: _filtros.hasta ?? hoy,
          alCambiar: (dia) =>
              setState(() => _filtros = _filtros.copyWith(desde: dia)),
        ),
      _Campo.hasta => CampoFecha(
          etiqueta: 'Hasta',
          valor: _filtros.hasta,
          primerDia: _filtros.desde ?? _primerDia,
          ultimoDia: hoy,
          alCambiar: (dia) =>
              setState(() => _filtros = _filtros.copyWith(hasta: dia)),
        ),
    };
  }

  Widget _selectorCategoria(AsyncValue<List<Categoria>> categorias) {
    final lista = categorias.value ?? const <Categoria>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<int?>(
          key: ValueKey(lista.length),
          isExpanded: true,
          initialValue: lista.any((c) => c.id == _filtros.categoriaId)
              ? _filtros.categoriaId
              : null,
          decoration: InputDecoration(
            labelText: 'Categoría',
            helperText: switch (categorias) {
              AsyncData() => null,
              AsyncError() when !categorias.isLoading =>
                'No se pudieron cargar las categorías.',
              _ => 'Cargando categorías…',
            },
          ),
          items: [
            const DropdownMenuItem(value: null, child: Text('Todas')),
            for (final categoria in lista)
              DropdownMenuItem(
                value: categoria.id,
                child: Text(categoria.nombre, overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: categorias.hasValue
              ? (id) =>
                  setState(() => _filtros = _filtros.copyWith(categoriaId: id))
              : null,
        ),
        if (categorias.hasError && !categorias.isLoading)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () => ref.invalidate(categoriasProvider),
              child: const Text('Reintentar'),
            ),
          ),
      ],
    );
  }

  Widget _selectorBarrio(AsyncValue<List<String>> barrios) {
    final lista = barrios.value ?? const <String>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<String?>(
          key: ValueKey(lista.length),
          isExpanded: true,
          initialValue: lista.contains(_filtros.barrio) ? _filtros.barrio : null,
          decoration: InputDecoration(
            labelText: 'Barrio',
            helperText: switch (barrios) {
              AsyncData() => null,
              AsyncError() when !barrios.isLoading =>
                'No se pudieron cargar los barrios.',
              _ => 'Cargando barrios…',
            },
          ),
          items: [
            const DropdownMenuItem(value: null, child: Text('Todos')),
            for (final barrio in lista)
              DropdownMenuItem(
                value: barrio,
                child: Text(barrio, overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: barrios.hasValue
              ? (barrio) =>
                  setState(() => _filtros = _filtros.copyWith(barrio: barrio))
              : null,
        ),
        if (barrios.hasError && !barrios.isLoading)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () => ref.invalidate(barriosProvider),
              child: const Text('Reintentar'),
            ),
          ),
      ],
    );
  }
}