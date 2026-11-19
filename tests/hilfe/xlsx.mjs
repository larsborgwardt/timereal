import { execFileSync } from "node:child_process";

// Unabhängiger OOXML-Leser mit der Python-Standardbibliothek; kein Produkt-Writer.
export function leseXlsx(buffer) {
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `
import sys, io, json, zipfile, xml.etree.ElementTree as E
ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as z:
    strings=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        strings=[''.join(t.itertext()) for t in E.fromstring(z.read('xl/sharedStrings.xml'))]
    sheets=[]
    for sheet in E.fromstring(z.read('xl/workbook.xml')).find('x:sheets',ns):
        i=len(sheets)+1
        xml=E.fromstring(z.read('xl/worksheets/sheet%d.xml'%i))
        rows=[]
        for row in xml.findall('x:sheetData/x:row',ns):
            cells={}
            for c in row:
                t=c.get('t','n'); v=c.find('x:v',ns)
                value=None if v is None else v.text
                if t=='s': value=strings[int(value)]
                elif t=='inlineStr': value=''.join(c.find('x:is',ns).itertext())
                elif t=='n' and value is not None: value=float(value)
                cells[c.get('r')]={'type':t,'value':value,'formula':c.find('x:f',ns) is not None}
            rows.append(cells)
        sheets.append({'name':sheet.get('name'),'rows':rows,'pane':xml.find('x:sheetViews/x:sheetView/x:pane',ns).attrib if xml.find('x:sheetViews/x:sheetView/x:pane',ns) is not None else None})
    print(json.dumps({'sheets':sheets,'files':z.namelist()},ensure_ascii=False))
`,
      ],
      { input: buffer, maxBuffer: 16 * 1024 * 1024 },
    ).toString(),
  );
}
