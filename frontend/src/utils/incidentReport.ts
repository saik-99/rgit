import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * Strips all emojis and surrogate pairs from a string, ensuring Helvetica
 * can safely render all text without errors.
 */
function stripEmojis(str: any): string {
  if (str === null || str === undefined) return ''
  const s = String(str)
  return s
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}]/gu,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Generates and downloads an A4 portrait PDF report for a single incident.
 */
export function downloadIncidentReport(incident: any, operatorStatus?: string): void {
  if (!incident) return

  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
    })

    const MARGIN = 40
    const ACCENT_COLOR: [number, number, number] = [8, 145, 178] // #0891b2
    const TEXT_DARK: [number, number, number] = [31, 41, 55] // Dark grey #1f2937
    const TEXT_MUTED: [number, number, number] = [107, 114, 128] // #6b7280
    const LINE_COLOR: [number, number, number] = [8, 145, 178]

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const contentWidth = pageWidth - MARGIN * 2

    let currentY = MARGIN

    // 1. Header: "UrbanFusion · Incident Report" (left), generated date-time (right), thin accent line below
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...ACCENT_COLOR)
    doc.text('UrbanFusion · Incident Report', MARGIN, currentY)

    const now = new Date()
    const dateStr = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })
    const genDateTime = `${dateStr} ${timeStr}`

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(genDateTime, pageWidth - MARGIN, currentY, { align: 'right' })

    currentY += 8
    doc.setDrawColor(...LINE_COLOR)
    doc.setLineWidth(0.75)
    doc.line(MARGIN, currentY, pageWidth - MARGIN, currentY)
    currentY += 16

    // 2. Title block: incident title, then one line: Incident ID · City · Location
    const rawTitle = incident.title || incident.cause_label || incident.primary_cause || 'Incident Report'
    const cleanTitle = stripEmojis(rawTitle)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(...TEXT_DARK)

    const titleLines = doc.splitTextToSize(cleanTitle, contentWidth)
    doc.text(titleLines, MARGIN, currentY)
    currentY += titleLines.length * 17 + 4

    const incId = stripEmojis(incident.incident_id || 'ID-UNKNOWN')
    const city = stripEmojis(incident.city || 'Sector')
    let location = stripEmojis(incident.neighborhood || incident.city || '')
    if (location.startsWith('SYN-') || location.startsWith('REAL-EV-') || location.startsWith('REAL-EVT-')) {
      location = city
    }
    const subLineParts = [incId, city, location].filter(Boolean)
    const subLine = subLineParts.join(' · ')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(subLine, MARGIN, currentY)
    currentY += 16

    // 3. Key facts table (2 columns): Severity, Confidence %, Confidence level, Primary cause, Status, Event count
    const confVal = incident.cause_confidence != null ? `${Math.round(incident.cause_confidence * 100)}%` : '—'
    const confLevel = incident.confidence_level ? stripEmojis(incident.confidence_level).toUpperCase() : '—'
    const sevVal = incident.severity_level
      ? `${stripEmojis(incident.severity_level)}${incident.severity_score != null ? ` (${incident.severity_score}/100)` : ''}`
      : '—'
    const causeVal = stripEmojis(incident.cause_label || incident.primary_cause || '—')
    const statusVal = stripEmojis(operatorStatus || incident.status || 'New')
    const eventsCount = incident.events?.length ?? incident.event_ids?.length ?? 0
    const eventCountVal = String(eventsCount)

    const keyFactsData = [
      ['Severity', sevVal],
      ['Confidence %', confVal],
      ['Confidence level', confLevel],
      ['Primary cause', causeVal],
      ['Status', statusVal],
      ['Event count', eventCountVal],
    ]

    autoTable(doc, {
      startY: currentY,
      margin: { left: MARGIN, right: MARGIN },
      body: keyFactsData,
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
        textColor: TEXT_DARK,
      },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: TEXT_MUTED, cellWidth: 110 },
        1: { textColor: TEXT_DARK, fontStyle: 'normal' },
      },
    })

    currentY = (doc as any).lastAutoTable.finalY + 14

    function addSectionHeader(title: string) {
      if (currentY > pageHeight - 70) {
        doc.addPage()
        currentY = MARGIN
      }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10.5)
      doc.setTextColor(...ACCENT_COLOR)
      doc.text(title, MARGIN, currentY)
      currentY += 4
      doc.setDrawColor(...LINE_COLOR)
      doc.setLineWidth(0.5)
      doc.line(MARGIN, currentY, MARGIN + 45, currentY)
      currentY += 10
    }

    // 4. "Summary": the incident summary text, wrapped to page width
    const summaryText = stripEmojis(incident.summary || incident.explanation || '')
    if (summaryText) {
      addSectionHeader('Summary')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...TEXT_DARK)
      const summaryLines = doc.splitTextToSize(summaryText, contentWidth)

      if (currentY + summaryLines.length * 12 > pageHeight - 40) {
        doc.addPage()
        currentY = MARGIN
      }
      doc.text(summaryLines, MARGIN, currentY)
      currentY += summaryLines.length * 12 + 14
    }

    // 5. "Probable cause": table Cause | Probability % from cause_ranking (top 5)
    if (Array.isArray(incident.cause_ranking) && incident.cause_ranking.length > 0) {
      const topCauses = incident.cause_ranking.slice(0, 5)
      const tableData = topCauses.map((cr: any) => [
        stripEmojis(cr.label || cr.cause || 'Unknown'),
        cr.probability != null ? `${Math.round(cr.probability * 100)}%` : '—',
      ])

      addSectionHeader('Probable cause')

      autoTable(doc, {
        startY: currentY,
        margin: { left: MARGIN, right: MARGIN },
        head: [['Cause', 'Probability %']],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: ACCENT_COLOR,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5,
        },
        styles: {
          font: 'helvetica',
          fontSize: 8,
          textColor: TEXT_DARK,
          cellPadding: 3.5,
        },
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { cellWidth: 90, halign: 'right' },
        },
      })

      currentY = (doc as any).lastAutoTable.finalY + 14
    }

    // 6. "Why confidence is not higher": bullet list from why_not_higher
    if (Array.isArray(incident.why_not_higher) && incident.why_not_higher.length > 0) {
      const validItems = incident.why_not_higher.filter(Boolean)
      if (validItems.length > 0) {
        addSectionHeader('Why confidence is not higher')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(...TEXT_DARK)

        for (const item of validItems) {
          const cleanItem = stripEmojis(item)
          const lines = doc.splitTextToSize(cleanItem, contentWidth - 14)
          if (currentY + lines.length * 11 > pageHeight - 40) {
            doc.addPage()
            currentY = MARGIN
          }
          doc.text('•', MARGIN + 2, currentY)
          doc.text(lines, MARGIN + 12, currentY)
          currentY += lines.length * 11 + 2
        }
        currentY += 10
      }
    }

    // 7. "Check next": one line from check_next
    if (incident.check_next) {
      const checkNextText = stripEmojis(incident.check_next)
      if (checkNextText) {
        addSectionHeader('Check next')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(...TEXT_DARK)
        if (currentY + 12 > pageHeight - 40) {
          doc.addPage()
          currentY = MARGIN
        }
        doc.text(checkNextText, MARGIN, currentY)
        currentY += 16
      }
    }

    // 8. "Severity drivers": bullet list from severity_factors
    if (Array.isArray(incident.severity_factors) && incident.severity_factors.length > 0) {
      const validFactors = incident.severity_factors.filter(Boolean)
      if (validFactors.length > 0) {
        addSectionHeader('Severity drivers')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.5)
        doc.setTextColor(...TEXT_DARK)

        for (const factor of validFactors) {
          const cleanFactor = stripEmojis(factor)
          const lines = doc.splitTextToSize(cleanFactor, contentWidth - 14)
          if (currentY + lines.length * 11 > pageHeight - 40) {
            doc.addPage()
            currentY = MARGIN
          }
          doc.text('•', MARGIN + 2, currentY)
          doc.text(lines, MARGIN + 12, currentY)
          currentY += lines.length * 11 + 2
        }
        currentY += 10
      }
    }

    // 9. "Evidence": table Time | Type | Description | Data | Source, from events
    if (Array.isArray(incident.events) && incident.events.length > 0) {
      const evidenceRows: Array<any[]> = []
      const linkUrls: Record<number, string> = {}

      incident.events.forEach((evt: any, idx: number) => {
        const rawTime = evt.event_time || evt.time || evt.timestamp
        let timeStr = '—'
        if (rawTime) {
          try {
            const d = new Date(rawTime)
            if (!isNaN(d.getTime())) {
              timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            } else {
              timeStr = stripEmojis(rawTime)
            }
          } catch {
            timeStr = stripEmojis(rawTime)
          }
        }

        const typeStr = stripEmojis(evt.type || evt.source_type || '—')
        let desc = stripEmojis(
          evt.description || evt.payload?.description || evt.payload?.text || 'Telemetry signal recorded'
        )
        if (desc.length > 120) {
          desc = desc.substring(0, 117) + '...'
        }

        const dataStr = evt.is_synthetic ? 'Synthetic' : 'Real'
        const sourceUrl = evt.source_url ? String(evt.source_url).trim() : ''
        const sourceDisplay = sourceUrl ? 'Link' : '—'

        if (sourceUrl) {
          linkUrls[idx] = sourceUrl
        }

        evidenceRows.push([timeStr, typeStr, desc, dataStr, sourceDisplay])
      })

      if (evidenceRows.length > 0) {
        addSectionHeader('Evidence')

        autoTable(doc, {
          startY: currentY,
          margin: { left: MARGIN, right: MARGIN },
          head: [['Time', 'Type', 'Description', 'Data', 'Source']],
          body: evidenceRows,
          theme: 'striped',
          headStyles: {
            fillColor: ACCENT_COLOR,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8.5,
          },
          styles: {
            font: 'helvetica',
            fontSize: 8,
            textColor: TEXT_DARK,
            cellPadding: 3.5,
            overflow: 'linebreak',
          },
          columnStyles: {
            0: { cellWidth: 55 },
            1: { cellWidth: 70 },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 50 },
            4: { cellWidth: 45, textColor: ACCENT_COLOR, fontStyle: 'bold' },
          },
          didDrawCell: (data) => {
            if (data.section === 'body' && data.column.index === 4) {
              const url = linkUrls[data.row.index]
              if (url) {
                doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url })
              }
            }
          },
        })

        currentY = (doc as any).lastAutoTable.finalY + 14
      }
    }

    // 10. "Nearest help": table Type | Name | Distance (km) from nearest_infrastructure, skip names containing "Unnamed" or "Testing"
    if (incident.nearest_infrastructure) {
      const infraRows: Array<[string, string, string]> = []

      const checkAndAdd = (type: string, item: any) => {
        if (!item || typeof item !== 'object') return
        const name = stripEmojis(item.name || '')
        if (!name || name.includes('Unnamed') || name.includes('Testing')) return
        const dist = item.distance_km != null ? `${Number(item.distance_km).toFixed(2)} km` : '—'
        infraRows.push([type, name, dist])
      }

      if (Array.isArray(incident.nearest_infrastructure)) {
        incident.nearest_infrastructure.forEach((item: any) => {
          const type = stripEmojis(item.type || item.category || 'Facility')
          checkAndAdd(type, item)
        })
      } else if (typeof incident.nearest_infrastructure === 'object') {
        const labels: Record<string, string> = {
          hospital: 'Hospital',
          fire_station: 'Fire Station',
          station: 'Transit Station',
          police: 'Police Station',
        }
        for (const [k, v] of Object.entries(incident.nearest_infrastructure)) {
          const typeLabel = labels[k] || k.replace(/_/g, ' ')
          checkAndAdd(typeLabel, v)
        }
      }

      if (infraRows.length > 0) {
        addSectionHeader('Nearest help')

        autoTable(doc, {
          startY: currentY,
          margin: { left: MARGIN, right: MARGIN },
          head: [['Type', 'Name', 'Distance (km)']],
          body: infraRows,
          theme: 'striped',
          headStyles: {
            fillColor: ACCENT_COLOR,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8.5,
          },
          styles: {
            font: 'helvetica',
            fontSize: 8,
            textColor: TEXT_DARK,
            cellPadding: 3.5,
          },
          columnStyles: {
            0: { cellWidth: 100 },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 80, halign: 'right' },
          },
        })

        currentY = (doc as any).lastAutoTable.finalY + 14
      }
    }

    // 11. Footer on every page: "Generated by UrbanFusion" left, "Page X of Y" right
    const totalPages = doc.getNumberOfPages()
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...TEXT_MUTED)
      doc.text('Generated by UrbanFusion', MARGIN, pageHeight - 24)
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - MARGIN, pageHeight - 24, { align: 'right' })
    }

    // 12. Save PDF: UrbanFusion_<incident_id>_<YYYY-MM-DD>.pdf
    const idSanitized = stripEmojis(incident.incident_id || 'incident').replace(/[^a-zA-Z0-9_-]/g, '_')
    const ymd = new Date().toISOString().slice(0, 10)
    const filename = `UrbanFusion_${idSanitized}_${ymd}.pdf`

    doc.save(filename)
  } catch (err) {
    console.error('Failed to generate incident PDF report:', err)
  }
}
