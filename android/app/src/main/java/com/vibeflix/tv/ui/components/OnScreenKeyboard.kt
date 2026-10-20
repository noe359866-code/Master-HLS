package com.vibeflix.tv.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text

/**
 * Teclado en pantalla para TV (estilo WuPlay).
 *
 * En un mando no hay teclado fisico, asi que la busqueda se escribe con estas
 * teclas. Cada tecla es un boton de Compose for TV, de modo que el sistema de
 * foco de la TV recorre el teclado con el D-pad sin codigo extra.
 *
 * - Mayus alterna entre minusculas y mayusculas.
 * - "123" cambia a numeros y simbolos.
 * - Borrar quita un caracter; se puede borrar todo con la tecla de borrar
 *   pulsada dos veces seguidas (mismo comportamiento que en WuPlay).
 */
@Composable
fun OnScreenKeyboard(
    value: String,
    onChange: (String) -> Unit,
    onSubmit: (String) -> Unit,
    modifier: Modifier = Modifier,
    submitLabel: String = "Buscar",
) {
    var symbols by remember { mutableStateOf(false) }
    var uppercase by remember { mutableStateOf(false) }
    var cleared by remember { mutableStateOf(false) }

    val letterRows = listOf(
        listOf("q", "w", "e", "r", "t", "y", "u", "i", "o", "p"),
        listOf("a", "s", "d", "f", "g", "h", "j", "k", "l", "ñ"),
        listOf("z", "x", "c", "v", "b", "n", "m"),
    )
    val symbolRows = listOf(
        listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "0"),
        listOf("!", "?", ",", ".", ":", ";", "-", "_", "'", "\""),
        listOf("+", "=", "/", "*", "&", "%", "$", "#", "@"),
    )
    val rows = if (symbols) symbolRows else letterRows

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // Vista previa del texto escrito.
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(Color(0xFF111726))
                .border(1.dp, Color(0x33FFFFFF), RoundedCornerShape(10.dp))
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = value.ifBlank { "Escribe para buscar…" },
                style = MaterialTheme.typography.titleMedium,
                color = if (value.isBlank()) Color(0xFF98A2B8) else Color.White,
            )
        }

        rows.forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                row.forEach { char ->
                    Button(
                        onClick = {
                            onChange(value + if (uppercase) char.uppercase() else char)
                        },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.colors(containerColor = Color(0xFF151C2C)),
                    ) {
                        Text(
                            text = if (uppercase) char.uppercase() else char,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Button(
                onClick = {
                    symbols = !symbols
                    uppercase = false
                },
                modifier = Modifier.weight(1.4f),
                colors = ButtonDefaults.colors(containerColor = Color(0xFF151C2C)),
            ) {
                Text(if (symbols) "ABC" else "123")
            }
            Button(
                onClick = { uppercase = !uppercase },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.colors(containerColor = Color(0xFF151C2C)),
            ) {
                Text("⇧")
            }
            Button(
                onClick = { onChange(value + " ") },
                modifier = Modifier.weight(1.6f),
                colors = ButtonDefaults.colors(containerColor = Color(0xFF151C2C)),
            ) {
                Text("espacio")
            }
            Button(
                onClick = {
                    // Dos pulsaciones seguidas borran la consulta entera.
                    if (cleared) {
                        onChange("")
                        cleared = false
                    } else {
                        onChange(value.dropLast(1))
                        cleared = true
                    }
                },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.colors(containerColor = Color(0xFF151C2C)),
            ) {
                Text("⌫")
            }
            Button(
                onClick = { onSubmit(value) },
                modifier = Modifier.weight(1.8f),
            ) {
                Text(submitLabel, textAlign = TextAlign.Center)
            }
        }
    }
}

/** Fila de chips (historial de busquedas, generos filtrados…). */
@Composable
fun ChipRow(
    items: List<String>,
    onClick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.take(6).forEach { item ->
            Button(
                onClick = { onClick(item) },
                colors = ButtonDefaults.colors(containerColor = Color(0xFF151C2C)),
            ) {
                Text(item)
            }
        }
    }
}
