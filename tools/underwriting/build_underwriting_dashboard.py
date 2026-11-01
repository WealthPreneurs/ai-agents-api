"""Builds the WealthPreneurs Acquisition & Debt Service underwriting workbook.

Usage:
    python tools/underwriting/build_underwriting_dashboard.py [output.xlsx]

Every result in the workbook is a live Excel formula, so changing any blue
input cell recalculates the whole model.
"""
import sys

import openpyxl
from openpyxl.comments import Comment
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

UW = "'Underwriting & Debt'"  # quoted sheet name for cross-sheet references

CURRENCY = '$#,##0;($#,##0);"-"'
PERCENT = '0.0%;(0.0%);"-"'
MULTIPLE = '0.00"x"'


def create_advanced_underwriting_dashboard(output_path="WealthPreneurs_Underwriting_Dashboard.xlsx"):
    wb = openpyxl.Workbook()

    # Color palette (Executive Navy & Slate theme)
    navy_header = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
    soft_gray = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")
    accent_blue = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")
    accent_green = PatternFill(start_color="E2EFDA", end_color="E2EFDA", fill_type="solid")
    accent_yellow = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")
    accent_red = PatternFill(start_color="FCE4D6", end_color="FCE4D6", fill_type="solid")

    # Fonts (inputs are blue, formulas black, cross-sheet links green)
    font_title = Font(name="Segoe UI", size=16, bold=True, color="FFFFFF")
    font_header = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    font_section = Font(name="Segoe UI", size=11, bold=True, color="1F4E78")
    font_bold = Font(name="Segoe UI", size=11, bold=True, color="000000")
    font_regular = Font(name="Segoe UI", size=11, color="000000")
    font_input = Font(name="Segoe UI", size=11, bold=True, color="0000FF")
    font_link = Font(name="Segoe UI", size=11, color="008000")
    font_note = Font(name="Segoe UI", size=9, italic=True, color="595959")
    font_verdict = Font(name="Segoe UI", size=14, bold=True, color="000000")

    # Borders
    thin_side = Side(border_style="thin", color="D9D9D9")
    thick_bottom = Side(border_style="medium", color="000000")
    double_bottom = Side(border_style="double", color="000000")
    border_cell = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
    border_total = Border(top=thin_side, bottom=double_bottom)
    border_header = Border(bottom=thick_bottom)

    def fmt(cell, kind):
        if kind == "currency":
            cell.number_format = CURRENCY
        elif kind == "percent":
            cell.number_format = PERCENT
        elif kind == "integer":
            cell.number_format = "#,##0"
        elif kind == "multiple":
            cell.number_format = MULTIPLE

    def header_row(ws, row, names):
        ws.row_dimensions[row].height = 24
        for idx, name in enumerate(names, 1):
            c = ws.cell(row=row, column=idx, value=name)
            c.font = font_header
            c.fill = navy_header
            c.alignment = Alignment(horizontal="center" if idx > 1 else "left", vertical="center", wrap_text=True)
            c.border = border_header

    # =========================================================================
    # TAB 1: UNDERWRITING DASHBOARD & DEBT SERVICE
    # =========================================================================
    ws1 = wb.active
    ws1.title = "Underwriting & Debt"
    ws1.sheet_view.showGridLines = True

    ws1.merge_cells("A1:D1")
    ws1["A1"] = "WEALTHPRENEURS ACQUISITION & DEBT SERVICE ENGINE"
    ws1["A1"].font = font_title
    ws1["A1"].fill = navy_header
    ws1["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws1.row_dimensions[1].height = 40

    ws1["A2"] = "Blue cells are inputs - edit them and every result recalculates. Black = formula, green = link to another tab."
    ws1["A2"].font = font_note
    ws1.merge_cells("A2:D2")

    # Automated verdict, driven by the projected (value-add) leveraged results
    ws1.merge_cells("A3:B4")
    ws1.merge_cells("C3:D4")
    ws1["A3"] = "DEAL STATUS VERDICT:"
    ws1["A3"].font = font_bold
    ws1["A3"].alignment = Alignment(horizontal="right", vertical="center")
    ws1["C3"] = (
        '=IF(C32<=0,"🔴 NEGATIVE CASH FLOW (NO GO)",'
        'IF(C33>0.1,"🟢 GREEN LIGHT (GO DEAL)",'
        'IF(C33>=0.06,"🟡 YELLOW LIGHT (VALUE-ADD CAUTION)","🔴 RED LIGHT (LOW YIELD)")))'
    )
    ws1["C3"].font = font_verdict
    ws1["C3"].alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws1["C3"].comment = Comment(
        "Uses projected (value-add) results: Net Leveraged Cash Flow (C32) and "
        "Leveraged Cash-on-Cash (C33). >10% = Green, 6-10% = Yellow, <6% = Red.",
        "Underwriting Engine",
    )
    ws1.row_dimensions[3].height = 22
    ws1.row_dimensions[4].height = 22
    # Verdict cell background follows the light color
    ws1.conditional_formatting.add("C3:D4", FormulaRule(formula=["$C$32<=0"], fill=accent_red, stopIfTrue=True))
    ws1.conditional_formatting.add("C3:D4", FormulaRule(formula=["$C$33>0.1"], fill=accent_green, stopIfTrue=True))
    ws1.conditional_formatting.add("C3:D4", FormulaRule(formula=["$C$33>=0.06"], fill=accent_yellow, stopIfTrue=True))
    ws1.conditional_formatting.add("C3:D4", FormulaRule(formula=["$C$33<0.06"], fill=accent_red, stopIfTrue=True))

    sections_ws1 = [
        (6, "PROPERTY ACQUISITION METRICS", ["Parameter", "Input Value", "", ""]),
        (11, "ANNUAL INCOME PIPELINE", ["Income Category", "Current Status", "Projected (Value-Add)", "Variance"]),
        (17, "ANNUAL OPERATING EXPENSES", ["Expense Category", "Current Status", "Projected (Value-Add)", "Variance"]),
        (23, "DEAL STRUCTURE & DEBT CAPITALIZATION", ["Financing Parameter", "Input Value", "", ""]),
        (28, "LEVERAGED PERFORMANCE ENGINE (NET OUTPUTS)",
         ["Financial Metric", "Current Metric Value", "Projected Metric Value", "Target Barrier"]),
    ]
    for row_num, title, cols in sections_ws1:
        ws1.merge_cells(start_row=row_num, start_column=1, end_row=row_num, end_column=4)
        sec = ws1.cell(row=row_num, column=1, value=title)
        sec.font = font_section
        ws1.row_dimensions[row_num].height = 24
        header_row(ws1, row_num + 1, cols)
        ws1.row_dimensions[row_num + 1].height = 20

    # Inputs: (row, label, current value, projected value or None, format)
    inputs_ws1 = [
        (8, "Purchase Price", 1300000, None, "currency"),
        (9, "Estimated Renovations / Capex Budget", 150000, None, "currency"),
        (10, "Target Market Capitalization Rate", 0.065, None, "percent"),
        (13, "Gross Potential Rent (GPR)", 180000, 240000, "currency"),
        (14, "Ratio Utility Billing System (RUBS) Recovery", 0, 18000, "currency"),
        (15, "Other Income (Laundry, Storage, Fees)", 6000, 12000, "currency"),
        (19, "Real Estate Taxes & Insurance", 22000, 24000, "currency"),
        (20, "Master-Metered Utilities", 35000, 20000, "currency"),
        (21, "Property Management & Operational Overhead", 18000, 22000, "currency"),
        (25, "Loan-to-Value (LTV) %", 0.75, None, "percent"),
        (26, "Annual Mortgage Interest Rate", 0.0675, None, "percent"),
        (27, "Amortization Term (Years)", 30, None, "integer"),
    ]
    for row, label, current, projected, kind in inputs_ws1:
        lbl = ws1.cell(row=row, column=1, value=label)
        lbl.font = font_regular
        lbl.border = border_cell
        for col, val in ((2, current), (3, projected)):
            if val is None:
                continue
            c = ws1.cell(row=row, column=col, value=val)
            c.font = font_input
            c.border = border_cell
            fmt(c, kind)

    formulas_ws1 = [
        # Income / expense totals and variances
        ("A16", "Total Gross Income", "label"), ("B16", "=SUM(B13:B15)", "currency"),
        ("C16", "=SUM(C13:C15)", "currency"), ("D13", "=C13-B13", "currency"),
        ("D14", "=C14-B14", "currency"), ("D15", "=C15-B15", "currency"), ("D16", "=C16-B16", "currency"),
        ("A22", "Total Operating Expenses", "label"), ("B22", "=SUM(B19:B21)", "currency"),
        ("C22", "=SUM(C19:C21)", "currency"), ("D19", "=C19-B19", "currency"),
        ("D20", "=C20-B20", "currency"), ("D21", "=C21-B21", "currency"), ("D22", "=C22-B22", "currency"),
        # Debt: loan principal and annual debt service =PMT(rate/12, months, -principal)*12
        ("C25", "Total Loan Principal:", "text"), ("D25", "=B8*B25", "currency"),
        ("C26", "Total Annual Debt Service:", "text"), ("D26", "=PMT(B26/12,B27*12,-D25)*12", "currency"),
        ("C27", "Total Cash Equity Required:", "text"), ("D27", "=(B8-D25)+B9", "currency"),
        # Performance engine
        ("A30", "Net Operating Income (NOI)", "text"), ("B30", "=B16-B22", "currency"),
        ("C30", "=C16-C22", "currency"), ("D30", "Property Cash Flow Before Debt", "text"),
        ("A31", "Annual Debt Service (Mortgage)", "text"), ("B31", "=D26", "currency"),
        ("C31", "=D26", "currency"), ("D31", "Fixed Financing Cost Burden", "text"),
        ("A32", "Net Leveraged Cash Flow", "text"), ("B32", "=B30-B31", "currency"),
        ("C32", "=C30-C31", "currency"), ("D32", "True Take-Home Cash Flow", "text"),
        ("A33", "Leveraged Cash-on-Cash Return", "text"), ("B33", "=IF(D27=0,0,B32/D27)", "percent"),
        ("C33", "=IF(D27=0,0,C32/D27)", "percent"), ("D33", "> 10.0% Leveraged Target", "text"),
        ("A34", "Debt Service Coverage Ratio (DSCR)", "text"), ("B34", "=IF(B31=0,0,B30/B31)", "multiple"),
        ("C34", "=IF(C31=0,0,C30/C31)", "multiple"), ("D34", "> 1.25x Lender Minimum", "text"),
        ("A35", "Implied Value @ Target Cap Rate", "text"), ("B35", "=IF(B10=0,0,B30/B10)", "currency"),
        ("C35", "=IF(B10=0,0,C30/B10)", "currency"), ("D35", "NOI / Target Cap Rate", "text"),
        ("A36", "Value Created vs. All-In Cost", "text"), ("B36", "=B35-(B8+B9)", "currency"),
        ("C36", "=C35-(B8+B9)", "currency"), ("D36", "Forced Appreciation", "text"),
    ]
    for ref, value, kind in formulas_ws1:
        c = ws1[ref]
        c.value = value
        c.border = border_cell
        if kind in ("text", "label"):
            c.font = font_bold if kind == "label" else font_regular
        else:
            c.font = font_bold
            fmt(c, kind)

    for r in (16, 22):
        for col in range(1, 5):
            ws1.cell(row=r, column=col).border = border_total
            ws1.cell(row=r, column=col).fill = soft_gray
    for r in range(30, 37):
        for col in range(1, 4):
            ws1.cell(row=r, column=col).fill = accent_blue
    for ref in ("C25", "C26", "C27"):
        ws1[ref].alignment = Alignment(horizontal="right")

    ws1.column_dimensions["A"].width = 46
    for col in "BCD":
        ws1.column_dimensions[col].width = 30
    ws1.freeze_panes = "A6"

    # =========================================================================
    # TAB 2: 5-YEAR CASH FLOW PROJECTIONS
    # =========================================================================
    ws2 = wb.create_sheet(title="5-Year Projections")
    ws2.sheet_view.showGridLines = True

    ws2.merge_cells("A1:G1")
    ws2["A1"] = "5-YEAR VALUE-ADD PROJECTION LEDGER"
    ws2["A1"].font = font_title
    ws2["A1"].fill = navy_header
    ws2["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws2.row_dimensions[1].height = 40

    ws2.merge_cells("A3:F3")
    ws2["A3"] = "COMPOUND GROWTH ARCHITECTURE ASSUMPTIONS"
    ws2["A3"].font = font_section

    growth_inputs = [
        (4, "Annual Rental Growth Rate", 0.04, "Applied to GPR, RUBS and Other Income from Year 2."),
        (5, "Annual Expense Escalator Rate", 0.03, "Applied to every operating expense from Year 2."),
    ]
    for row, label, val, note in growth_inputs:
        ws2.cell(row=row, column=1, value=label).font = font_regular
        c = ws2.cell(row=row, column=2, value=val)
        c.font = font_input
        c.number_format = PERCENT
        c.border = border_cell
        ws2.cell(row=row, column=3, value=note).font = font_note

    ledger_headers = ["Financial Metric Ledger", "Year 1 (Stabilizing)", "Year 2", "Year 3", "Year 4", "Year 5"]
    header_row(ws2, 7, ledger_headers)

    years = "BCDEF"
    # (row, label, year-1 formula, growth-rate cell or None, kind, style)
    #   year-1 formulas link to the projected (value-add) column on Tab 1
    ledger = [
        (8, "Gross Potential Rent (GPR)", f"={UW}!C13", "$B$4"),
        (9, "RUBS Recovery", f"={UW}!C14", "$B$4"),
        (10, "Other Income", f"={UW}!C15", "$B$4"),
        (12, "Real Estate Taxes & Insurance", f"={UW}!C19", "$B$5"),
        (13, "Master-Metered Utilities", f"={UW}!C20", "$B$5"),
        (14, "Property Management & Overhead", f"={UW}!C21", "$B$5"),
    ]
    for row, label, y1, rate in ledger:
        ws2.cell(row=row, column=1, value=label).font = font_regular
        ws2.cell(row=row, column=1).border = border_cell
        for i, col in enumerate(years):
            c = ws2[f"{col}{row}"]
            if i == 0:
                c.value = y1
                c.font = font_link
            else:
                c.value = f"={years[i - 1]}{row}*(1+{rate})"
                c.font = font_regular
            c.number_format = CURRENCY
            c.border = border_cell

    calc_rows = [
        (11, "Total Gross Income", "=SUM({c}8:{c}10)", CURRENCY, "total"),
        (15, "Total Operating Expenses", "=SUM({c}12:{c}14)", CURRENCY, "total"),
        (16, "Net Operating Income (NOI)", "={c}11-{c}15", CURRENCY, "result"),
        (17, "Annual Debt Service", f"={UW}!$D$26", CURRENCY, "link"),
        (18, "Net Leveraged Cash Flow", "={c}16-{c}17", CURRENCY, "result"),
        (19, "Leveraged Cash-on-Cash Return", f"=IF({UW}!$D$27=0,0,{{c}}18/{UW}!$D$27)", PERCENT, "result"),
        (20, "Debt Service Coverage Ratio (DSCR)", "=IF({c}17=0,0,{c}16/{c}17)", MULTIPLE, "result"),
        (21, "Cumulative Cash Flow", None, CURRENCY, "result"),
    ]
    for row, label, template, number_format, style in calc_rows:
        lbl = ws2.cell(row=row, column=1, value=label)
        lbl.font = font_bold
        lbl.border = border_cell
        for i, col in enumerate(years):
            c = ws2[f"{col}{row}"]
            if row == 21:
                c.value = f"=B18" if i == 0 else f"={years[i - 1]}21+{col}18"
            else:
                c.value = template.replace("{c}", col)
            c.number_format = number_format
            c.font = font_link if style == "link" else font_bold
            c.border = border_cell
            if style == "total":
                c.fill = soft_gray
                c.border = border_total
            elif style == "result":
                c.fill = accent_blue
        if style == "total":
            lbl.fill = soft_gray
            lbl.border = border_total
        elif style == "result":
            lbl.fill = accent_blue

    # ---- Year-5 exit & returns analysis -----------------------------------
    ws2.merge_cells("A23:F23")
    ws2["A23"] = "YEAR-5 EXIT & INVESTOR RETURNS"
    ws2["A23"].font = font_section
    header_row(ws2, 24, ["Exit Parameter", "Value", "", "", "", ""])

    exit_rows = [
        (25, "Exit Capitalization Rate", f"={UW}!B10", PERCENT, font_link,
         "Defaults to the Tab 1 target cap rate; overwrite with a number to stress-test."),
        (26, "Selling Costs (% of Sale Price)", 0.03, PERCENT, font_input, "Broker, legal and closing costs."),
        (27, "Projected Sale Price (Year-5 NOI / Exit Cap)", "=IF(B25=0,0,F16/B25)", CURRENCY, font_bold, None),
        (28, "Less: Selling Costs", "=B27*B26", CURRENCY, font_bold, None),
        (29, "Less: Remaining Loan Balance (Year 5)",
         f"=-FV({UW}!B26/12,60,-PMT({UW}!B26/12,{UW}!B27*12,-{UW}!D25),{UW}!D25)",
         CURRENCY, font_bold, "Principal still owed after 60 monthly payments."),
        (30, "Net Sale Proceeds to Equity", "=B27-B28-B29", CURRENCY, font_bold, None),
        (31, "Total Cash Equity Invested", f"={UW}!D27", CURRENCY, font_link, None),
        (32, "Total Profit (Cash Flow + Sale - Equity)", "=F21+B30-B31", CURRENCY, font_bold, None),
        (33, "Equity Multiple", "=IF(B31=0,0,(F21+B30)/B31)", MULTIPLE, font_bold, "> 2.0x is a strong 5-year hold."),
        (34, "Levered IRR (5-Year Hold)", "=IRR(B38:G38)", PERCENT, font_bold, "> 15% is a strong value-add IRR."),
    ]
    for row, label, value, number_format, font, note in exit_rows:
        lbl = ws2.cell(row=row, column=1, value=label)
        lbl.font = font_regular
        lbl.border = border_cell
        c = ws2.cell(row=row, column=2, value=value)
        c.number_format = number_format
        c.font = font
        c.border = border_cell
        if note:
            ws2.cell(row=row, column=3, value=note).font = font_note
    for row in (30, 33, 34):
        ws2.cell(row=row, column=1).font = font_bold
        for col in (1, 2):
            ws2.cell(row=row, column=col).fill = accent_green

    # IRR cash-flow strip: Year 0 equity out, Years 1-5 cash flow, sale in Year 5
    ws2.merge_cells("A36:G36")
    ws2["A36"] = "LEVERED CASH FLOW STRIP (FEEDS IRR)"
    ws2["A36"].font = font_section
    header_row(ws2, 37, ["Period", "Year 0 (Close)", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5 + Sale"])
    ws2["A38"] = "Net Cash to / (from) Investor"
    ws2["A38"].font = font_bold
    ws2["A38"].border = border_cell
    strip = ["=-B31", "=B18", "=C18", "=D18", "=E18", "=F18+B30"]
    for col, formula in zip("BCDEFG", strip):
        c = ws2[f"{col}38"]
        c.value = formula
        c.number_format = CURRENCY
        c.font = font_bold
        c.border = border_cell
        c.fill = accent_blue

    ws2.column_dimensions["A"].width = 44
    for col in "BCDEFG":
        ws2.column_dimensions[col].width = 20
    ws2.freeze_panes = "B8"

    wb.save(output_path)
    return output_path


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "WealthPreneurs_Underwriting_Dashboard.xlsx"
    print(f"Saved: {create_advanced_underwriting_dashboard(out)}")
