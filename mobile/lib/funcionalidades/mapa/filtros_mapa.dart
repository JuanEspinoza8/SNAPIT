import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/formato/fechas.dart';
import '../../compartido/tema/tema_app.dart';
import 'estados.dart';
import 'modelos.dart';
import 'repositorio_mapa.dart';

/// Abre los filtros y devuelve los elegidos. Null si se cerró sin aplicar.
Future<FiltrosMapa?> elegirFiltros(BuildContext context, FiltrosMapa actuales) {
  return showModalBottomSheet<FiltrosMapa>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => _HojaFiltros(actuales),
  );
}

class _HojaFiltros extends ConsumerStatefulWidget {
  const _HojaFiltros(this.actuales);

  final FiltrosMapa actuales;

  @override
  ConsumerState<_HojaFiltros> createState() => _HojaFiltrosState();
}

class _HojaFiltrosState extends ConsumerState<_HojaFiltros> {
  late int? _categoriaId = widget.actuales.categoriaId;
  late EstadoVisible? _estado = widget.actuales.estado;
  late DateTime? _desde = widget.actuales.desde;
  late DateTime? _hasta = widget.actuales.hasta;

  // Los primeros reportes son de 2026; el margen no molesta.
  static final _primerDia = DateTime(2020);

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final hoy = DateUtils.dateOnly(DateTime.now());

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(Espacio.lg, 0, Espacio.lg, Espacio.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Filtros', style: tema.textTheme.titleMedium),
          const SizedBox(height: Espacio.lg),
          _campoCategoria(),
          const SizedBox(height: Espacio.lg),
          DropdownButtonFormField<EstadoVisible?>(
            initialValue: _estado,
            style: tema.textTheme.bodyLarge,
            decoration: const InputDecoration(labelText: 'Estado'),
            items: [
              const DropdownMenuItem(value: null, child: Text('Todos')),
              for (final estado in EstadoVisible.values)
                DropdownMenuItem(value: estado, child: Text(estado.etiqueta)),
            ],
            onChanged: (estado) => setState(() => _estado = estado),
          ),
          const SizedBox(height: Espacio.lg),
          _CampoFecha(
            etiqueta: 'Desde',
            valor: _desde,
            primerDia: _primerDia,
            ultimoDia: _hasta ?? hoy,
            alCambiar: (dia) => setState(() => _desde = dia),
          ),
          const SizedBox(height: Espacio.lg),
          _CampoFecha(
            etiqueta: 'Hasta',
            valor: _hasta,
            primerDia: _desde ?? _primerDia,
            ultimoDia: hoy,
            alCambiar: (dia) => setState(() => _hasta = dia),
          ),
          const SizedBox(height: Espacio.xl),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(
              FiltrosMapa(
                categoriaId: _categoriaId,
                estado: _estado,
                desde: _desde,
                hasta: _hasta,
              ),
            ),
            child: const Text('Aplicar filtros'),
          ),
          const SizedBox(height: Espacio.sm),
          TextButton(
            onPressed: () => Navigator.of(context).pop(const FiltrosMapa()),
            child: const Text('Limpiar filtros'),
          ),
        ],
      ),
    );
  }

  Widget _campoCategoria() {
    final categorias = ref.watch(categoriasProvider);
    final lista = categorias.value ?? const <Categoria>[];
    final ayuda = switch (categorias) {
      AsyncData() => null,
      AsyncError() when !categorias.isLoading =>
        'No se pudieron cargar las categorías.',
      _ => 'Cargando categorías…',
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<int?>(
          // Cambia de clave al llegar las categorías, para que tome el valor.
          key: ValueKey(lista.length),
          initialValue: lista.any((c) => c.id == _categoriaId)
              ? _categoriaId
              : null,
          style: Theme.of(context).textTheme.bodyLarge,
          decoration: InputDecoration(
            labelText: 'Categoría',
            helperText: ayuda,
          ),
          items: [
            const DropdownMenuItem(value: null, child: Text('Todas')),
            for (final categoria in lista)
              DropdownMenuItem(
                value: categoria.id,
                child: Text(categoria.nombre),
              ),
          ],
          onChanged: categorias.hasValue
              ? (id) => setState(() => _categoriaId = id)
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
}

/// Un día elegido con el calendario, con un botón para borrarlo.
class _CampoFecha extends StatelessWidget {
  const _CampoFecha({
    required this.etiqueta,
    required this.valor,
    required this.primerDia,
    required this.ultimoDia,
    required this.alCambiar,
  });

  final String etiqueta;
  final DateTime? valor;
  final DateTime primerDia;
  final DateTime ultimoDia;
  final ValueChanged<DateTime?> alCambiar;

  Future<void> _elegir(BuildContext context) async {
    final dia = await showDatePicker(
      context: context,
      initialDate: valor ?? ultimoDia,
      firstDate: primerDia,
      lastDate: ultimoDia,
      helpText: etiqueta,
      // Como el resto de los botones de la app, sin mayúsculas sostenidas.
      confirmText: 'Aceptar',
      cancelText: 'Cancelar',
    );
    if (dia != null) alCambiar(dia);
  }

  @override
  Widget build(BuildContext context) {
    final valor = this.valor;
    return InkWell(
      onTap: () => _elegir(context),
      borderRadius: BorderRadius.circular(radioBorde),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: etiqueta,
          suffixIcon: valor == null
              ? const Icon(Icons.calendar_today_outlined)
              : IconButton(
                  tooltip: 'Borrar la fecha «${etiqueta.toLowerCase()}»',
                  icon: const Icon(Icons.close),
                  onPressed: () => alCambiar(null),
                ),
        ),
        child: Text(valor == null ? 'Cualquier fecha' : fechaCorta(valor)),
      ),
    );
  }
}
