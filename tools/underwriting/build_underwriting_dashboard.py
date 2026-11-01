"""Builds the WealthPreneurs Acquisition & Debt Service underwriting workbook.

Usage:
    python tools/underwriting/build_underwriting_dashboard.py [output.xlsx]

Every result in the workbook is a live Excel formula, so changing any blue
input cell recalculates the whole model.

Tabs:
  1. Underwriting & Debt  - current vs. stabilized (value-add) operations, debt, verdict
  2. 5-Year Projections   - Year 1 ramps toward stabilized, Years 2-5 grow from stabilized
  3. Sensitivity          - four 5x5 IRR / equity-multiple grids, each backed by a scenario engine
"""
import sys

import openpyxl
from openpyxl.comments import Comment
from openpyxl.formatting.rule import ColorScaleRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

UW = "'Underwriting & Debt'"  # quoted sheet names for cross-sheet references
P = "'5-Year Projections'"

CURRENCY = '$#,##0;($#,##0);"-"'
PERCENT = '0.0%;(0.0%);"-"'
MULTIPLE = '0.00"x"'

# --- Tab 1 row map ---------------------------------------------------------
R_PRICE, R_CAPEX, R_TARGET_CAP = 8, 9, 10
R_GPR, R_VAC_PCT, R_VAC, R_RUBS, R_OTHER, R_EGI = 13, 14, 15, 16, 17, 18
R_TAX, R_UTIL, R_MGMT, R_RM, R_RES, R_OPEX = 21, 22, 23, 24, 25, 26
R_LTV, R_RATE, R_TERM = 29, 30, 31          # D29 loan, D30 debt service, D31 equity
R_NOI, R_DS, R_CF, R_COC, R_DSCR, R_VALUE, R_CREATED = 34, 35, 36, 37, 38, 39, 40

# --- Tab 2 row map ---------------------------------------------------------
P_RENT_G, P_EXP_G, P_RAMP = 4, 5, 6
P_HDR = 8
P_GPR, P_VAC_PCT, P_VAC, P_RUBS, P_OTHER, P_EGI = 9, 10, 11, 12, 13, 14
P_TAX, P_UTIL, P_MGMT, P_RM, P_RES, P_OPEX = 15, 16, 17, 18, 19, 20
P_NOI, P_DS, P_CF, P_COC, P_DSCR, P_CUM = 21, 22, 23, 24, 25, 26
P_EXIT_CAP, P_SELL, P_SALE, P_COSTS, P_BAL, P_NET, P_EQ, P_PROFIT, P_EM, P_IRR = range(30, 40)
P_STRIP = 43


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
    thick_side = Side(border_style="medium", color="000000")
    double_bottom = Side(border_style="double", color="000000")
    border_cell = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
    border_total = Border(top=thin_side, bottom=double_bottom)
    border_header = Border(bottom=thick_side)
    border_base = Border(left=thick_side, right=thick_side, top=thick_side, bottom=thick_side)

    def header_row(ws, row, names):
        ws.row_dimensions[row].height = 24
        for idx, name in enumerate(names, 1):
            c = ws.cell(row=row, column=idx, value=name)
            c.font = font_header
            c.fill = navy_header
            c.alignment = Alignment(horizontal="center" if idx > 1 else "left", vertical="center", wrap_text=True)
            c.border = border_header

    def put(ws, ref, value, number_format=CURRENCY, font=font_bold, fill=None, border=border_cell):
        c = ws[ref]
        c.value = value
        c.number_format = number_format
        c.font = font
        if border is not None:
            c.border = border
        if fill is not None:
            c.fill = fill
        return c

    def banner(ws, rng, text):
        ws.merge_cells(rng)
        anchor = rng.split(":")[0]
        ws[anchor] = text
        ws[anchor].font = font_title
        ws[anchor].fill = navy_header
        ws[anchor].alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[1].height = 40

    def note(ws, ref, text, merge_to=None):
        if merge_to:
            ws.merge_cells(f"{ref}:{merge_to}")
        ws[ref] = text
        ws[ref].font = font_note

    # =========================================================================
    # TAB 1: UNDERWRITING DASHBOARD & DEBT SERVICE
    # =========================================================================
    ws1 = wb.active
    ws1.title = "Underwriting & Debt"
    ws1.sheet_view.showGridLines = True
    banner(ws1, "A1:D1", "WEALTHPRENEURS ACQUISITION & DEBT SERVICE ENGINE")
    note(ws1, "A2", "Blue cells are inputs - edit them and every result recalculates. "
                    "Black = formula, green = link to another tab.", "D2")

    # Automated verdict, driven by the stabilized (value-add) leveraged results
    ws1.merge_cells("A3:B4")
    ws1.merge_cells("C3:D4")
    ws1["A3"] = "DEAL STATUS VERDICT:"
    ws1["A3"].font = font_bold
    ws1["A3"].alignment = Alignment(horizontal="right", vertical="center")
    ws1["C3"] = (
        f'=IF(C{R_CF}<=0,"🔴 NEGATIVE CASH FLOW (NO GO)",'
        f'IF(C{R_COC}>0.1,"🟢 GREEN LIGHT (GO DEAL)",'
        f'IF(C{R_COC}>=0.06,"🟡 YELLOW LIGHT (VALUE-ADD CAUTION)","🔴 RED LIGHT (LOW YIELD)")))'
    )
    ws1["C3"].font = font_verdict
    ws1["C3"].alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws1["C3"].comment = Comment(
        f"Uses stabilized (value-add) results: Net Leveraged Cash Flow (C{R_CF}) and "
        f"Leveraged Cash-on-Cash (C{R_COC}). >10% = Green, 6-10% = Yellow, <6% = Red.",
        "Underwriting Engine",
    )
    ws1.row_dimensions[3].height = 22
    ws1.row_dimensions[4].height = 22
    for formula, fill in ((f"$C${R_CF}<=0", accent_red), (f"$C${R_COC}>0.1", accent_green),
                          (f"$C${R_COC}>=0.06", accent_yellow), (f"$C${R_COC}<0.06", accent_red)):
        ws1.conditional_formatting.add("C3:D4", FormulaRule(formula=[formula], fill=fill, stopIfTrue=True))

    sections_ws1 = [
        (6, "PROPERTY ACQUISITION METRICS", ["Parameter", "Input Value", "", ""]),
        (11, "ANNUAL INCOME PIPELINE", ["Income Category", "Current Status", "Stabilized (Value-Add)", "Variance"]),
        (19, "ANNUAL OPERATING EXPENSES", ["Expense Category", "Current Status", "Stabilized (Value-Add)", "Variance"]),
        (27, "DEAL STRUCTURE & DEBT CAPITALIZATION", ["Financing Parameter", "Input Value", "", ""]),
        (32, "LEVERAGED PERFORMANCE ENGINE (NET OUTPUTS)",
         ["Financial Metric", "Current Metric Value", "Stabilized Metric Value", "Target Barrier"]),
    ]
    for row_num, title, cols in sections_ws1:
        ws1.merge_cells(start_row=row_num, start_column=1, end_row=row_num, end_column=4)
        ws1.cell(row=row_num, column=1, value=title).font = font_section
        ws1.row_dimensions[row_num].height = 24
        header_row(ws1, row_num + 1, cols)

    # Inputs: (row, label, current, stabilized or None, number format, comment)
    inputs_ws1 = [
        (R_PRICE, "Purchase Price", 1300000, None, CURRENCY, None),
        (R_CAPEX, "Estimated Renovations / Capex Budget", 150000, None, CURRENCY, None),
        (R_TARGET_CAP, "Target Market Capitalization Rate", 0.065, None, PERCENT, None),
        (R_GPR, "Gross Potential Rent (GPR)", 180000, 240000, CURRENCY, None),
        (R_VAC_PCT, "Vacancy & Credit Loss (% of GPR)", 0.07, 0.05, PERCENT,
         "Placeholder assumption: 7% in place, 5% once renovated and re-leased. "
         "Replace with the rent roll's actual economic vacancy and local market data."),
        (R_RUBS, "Ratio Utility Billing System (RUBS) Recovery", 0, 18000, CURRENCY, None),
        (R_OTHER, "Other Income (Laundry, Storage, Fees)", 6000, 12000, CURRENCY, None),
        (R_TAX, "Real Estate Taxes & Insurance", 22000, 24000, CURRENCY, None),
        (R_UTIL, "Master-Metered Utilities", 35000, 20000, CURRENCY, None),
        (R_MGMT, "Property Management & Operational Overhead", 18000, 22000, CURRENCY, None),
        (R_RM, "Repairs & Maintenance", 12000, 12000, CURRENCY,
         "Placeholder assumption ($12k/yr). Replace with the seller's T-12 or ~$600-900 per unit."),
        (R_RES, "Replacement Reserves", 7500, 7500, CURRENCY,
         "Placeholder assumption ($7.5k/yr). Lenders typically require $250-350 per unit per year."),
        (R_LTV, "Loan-to-Value (LTV) %", 0.75, None, PERCENT, None),
        (R_RATE, "Annual Mortgage Interest Rate", 0.0675, None, PERCENT, None),
        (R_TERM, "Amortization Term (Years)", 30, None, "#,##0", None),
    ]
    for row, label, current, stabilized, number_format, comment in inputs_ws1:
        lbl = ws1.cell(row=row, column=1, value=label)
        lbl.font = font_regular
        lbl.border = border_cell
        for col, val in (("B", current), ("C", stabilized)):
            if val is not None:
                c = put(ws1, f"{col}{row}", val, number_format, font_input)
                if comment:
                    c.comment = Comment(comment, "Underwriting Engine")

    formulas_ws1 = [
        # Income
        (f"A{R_VAC}", "Less: Vacancy & Credit Loss", None),
        (f"B{R_VAC}", f"=-B{R_GPR}*B{R_VAC_PCT}", CURRENCY), (f"C{R_VAC}", f"=-C{R_GPR}*C{R_VAC_PCT}", CURRENCY),
        (f"A{R_EGI}", "Effective Gross Income (EGI)", "label"),
        (f"B{R_EGI}", f"=B{R_GPR}+B{R_VAC}+B{R_RUBS}+B{R_OTHER}", CURRENCY),
        (f"C{R_EGI}", f"=C{R_GPR}+C{R_VAC}+C{R_RUBS}+C{R_OTHER}", CURRENCY),
        # Expenses
        (f"A{R_OPEX}", "Total Operating Expenses", "label"),
        (f"B{R_OPEX}", f"=SUM(B{R_TAX}:B{R_RES})", CURRENCY), (f"C{R_OPEX}", f"=SUM(C{R_TAX}:C{R_RES})", CURRENCY),
        # Debt: loan principal, annual debt service =PMT(rate/12, months, -principal)*12, equity
        (f"C{R_LTV}", "Total Loan Principal:", None), (f"D{R_LTV}", f"=B{R_PRICE}*B{R_LTV}", CURRENCY),
        (f"C{R_RATE}", "Total Annual Debt Service:", None),
        (f"D{R_RATE}", f"=PMT(B{R_RATE}/12,B{R_TERM}*12,-D{R_LTV})*12", CURRENCY),
        (f"C{R_TERM}", "Total Cash Equity Required:", None),
        (f"D{R_TERM}", f"=(B{R_PRICE}-D{R_LTV})+B{R_CAPEX}", CURRENCY),
    ]
    perf = [
        (R_NOI, "Net Operating Income (NOI)", f"=B{R_EGI}-B{R_OPEX}", f"=C{R_EGI}-C{R_OPEX}",
         CURRENCY, "Property Cash Flow Before Debt"),
        (R_DS, "Annual Debt Service (Mortgage)", f"=D{R_RATE}", f"=D{R_RATE}", CURRENCY, "Fixed Financing Cost Burden"),
        (R_CF, "Net Leveraged Cash Flow", f"=B{R_NOI}-B{R_DS}", f"=C{R_NOI}-C{R_DS}", CURRENCY,
         "True Take-Home Cash Flow"),
        (R_COC, "Leveraged Cash-on-Cash Return", f"=IF(D{R_TERM}=0,0,B{R_CF}/D{R_TERM})",
         f"=IF(D{R_TERM}=0,0,C{R_CF}/D{R_TERM})", PERCENT, "> 10.0% Leveraged Target"),
        (R_DSCR, "Debt Service Coverage Ratio (DSCR)", f"=IF(B{R_DS}=0,0,B{R_NOI}/B{R_DS})",
         f"=IF(C{R_DS}=0,0,C{R_NOI}/C{R_DS})", MULTIPLE, "> 1.25x Lender Minimum"),
        (R_VALUE, "Implied Value @ Target Cap Rate", f"=IF(B{R_TARGET_CAP}=0,0,B{R_NOI}/B{R_TARGET_CAP})",
         f"=IF(B{R_TARGET_CAP}=0,0,C{R_NOI}/B{R_TARGET_CAP})", CURRENCY, "NOI / Target Cap Rate"),
        (R_CREATED, "Value Created vs. All-In Cost", f"=B{R_VALUE}-(B{R_PRICE}+B{R_CAPEX})",
         f"=C{R_VALUE}-(B{R_PRICE}+B{R_CAPEX})", CURRENCY, "Forced Appreciation"),
    ]
    for row, label, cur, stab, number_format, target in perf:
        formulas_ws1 += [(f"A{row}", label, None), (f"B{row}", cur, number_format),
                         (f"C{row}", stab, number_format), (f"D{row}", target, None)]
    for row in (R_GPR, R_VAC, R_RUBS, R_OTHER, R_EGI, R_TAX, R_UTIL, R_MGMT, R_RM, R_RES, R_OPEX):
        formulas_ws1.append((f"D{row}", f"=C{row}-B{row}", CURRENCY))
    formulas_ws1.append((f"D{R_VAC_PCT}", f"=C{R_VAC_PCT}-B{R_VAC_PCT}", PERCENT))

    for ref, value, number_format in formulas_ws1:
        if number_format in (None, "label"):
            c = ws1[ref]
            c.value = value
            c.font = font_bold if number_format == "label" else font_regular
            c.border = border_cell
        else:
            put(ws1, ref, value, number_format)

    for r in (R_EGI, R_OPEX):
        for col in "ABCD":
            ws1[f"{col}{r}"].border = border_total
            ws1[f"{col}{r}"].fill = soft_gray
    for r in range(R_NOI, R_CREATED + 1):
        for col in "ABC":
            ws1[f"{col}{r}"].fill = accent_blue
    for r in (R_LTV, R_RATE, R_TERM):
        ws1[f"C{r}"].alignment = Alignment(horizontal="right")
    note(ws1, f"A{R_CREATED + 2}", "Reserves are treated as an operating expense (above NOI), the conservative "
                                   "lender convention. Hover the red-cornered cells for the placeholder sources.",
         f"D{R_CREATED + 2}")

    ws1.column_dimensions["A"].width = 46
    for col in "BCD":
        ws1.column_dimensions[col].width = 30
    ws1.freeze_panes = "A6"

    # =========================================================================
    # TAB 2: 5-YEAR CASH FLOW PROJECTIONS
    # =========================================================================
    ws2 = wb.create_sheet(title="5-Year Projections")
    ws2.sheet_view.showGridLines = True
    banner(ws2, "A1:G1", "5-YEAR VALUE-ADD PROJECTION LEDGER")

    ws2.merge_cells("A3:F3")
    ws2["A3"] = "COMPOUND GROWTH & STABILIZATION ASSUMPTIONS"
    ws2["A3"].font = font_section
    growth_inputs = [
        (P_RENT_G, "Annual Rental Growth Rate", 0.04, "Applied to GPR, RUBS and Other Income from Year 3."),
        (P_EXP_G, "Annual Expense Escalator Rate", 0.03, "Applied to every operating expense from Year 3."),
        (P_RAMP, "Year-1 Stabilization Ramp (% of value-add achieved)", 0.5,
         "Year 1 = current + this % of the gap to stabilized. Year 2 = fully stabilized (grown one year)."),
    ]
    for row, label, val, text in growth_inputs:
        ws2.cell(row=row, column=1, value=label).font = font_regular
        put(ws2, f"B{row}", val, PERCENT, font_input)
        ws2.cell(row=row, column=3, value=text).font = font_note

    header_row(ws2, P_HDR, ["Financial Metric Ledger", "Year 1 (Stabilizing)", "Year 2 (Stabilized)",
                            "Year 3", "Year 4", "Year 5"])
    years = "BCDEF"
    ramp = f"$B${P_RAMP}"

    def label(ws, row, text, bold=False, fill=None, border=border_cell):
        c = ws.cell(row=row, column=1, value=text)
        c.font = font_bold if bold else font_regular
        c.border = border
        if fill:
            c.fill = fill

    # Line items driven from Tab 1: (Tab 2 row, Tab 1 row, label, growth cell or None)
    line_items = [
        (P_GPR, R_GPR, "Gross Potential Rent (GPR)", f"$B${P_RENT_G}"),
        (P_RUBS, R_RUBS, "RUBS Recovery", f"$B${P_RENT_G}"),
        (P_OTHER, R_OTHER, "Other Income", f"$B${P_RENT_G}"),
        (P_TAX, R_TAX, "Real Estate Taxes & Insurance", f"$B${P_EXP_G}"),
        (P_UTIL, R_UTIL, "Master-Metered Utilities", f"$B${P_EXP_G}"),
        (P_MGMT, R_MGMT, "Property Management & Overhead", f"$B${P_EXP_G}"),
        (P_RM, R_RM, "Repairs & Maintenance", f"$B${P_EXP_G}"),
        (P_RES, R_RES, "Replacement Reserves", f"$B${P_EXP_G}"),
    ]
    for prow, urow, text, rate in line_items:
        label(ws2, prow, text)
        put(ws2, f"B{prow}", f"={UW}!B{urow}+({UW}!C{urow}-{UW}!B{urow})*{ramp}", font=font_link)
        put(ws2, f"C{prow}", f"={UW}!C{urow}*(1+{rate})", font=font_link)
        for i in range(2, 5):
            put(ws2, f"{years[i]}{prow}", f"={years[i - 1]}{prow}*(1+{rate})", font=font_regular)

    label(ws2, P_VAC_PCT, "Vacancy & Credit Loss (% of GPR)")
    put(ws2, f"B{P_VAC_PCT}", f"={UW}!B{R_VAC_PCT}+({UW}!C{R_VAC_PCT}-{UW}!B{R_VAC_PCT})*{ramp}",
        PERCENT, font_link)
    for col in years[1:]:
        put(ws2, f"{col}{P_VAC_PCT}", f"={UW}!$C${R_VAC_PCT}", PERCENT, font_link)
    label(ws2, P_VAC, "Less: Vacancy & Credit Loss")
    for col in years:
        put(ws2, f"{col}{P_VAC}", f"=-{col}{P_GPR}*{col}{P_VAC_PCT}", font=font_regular)

    calc_rows = [
        (P_EGI, "Effective Gross Income (EGI)", "={c}%d+{c}%d+{c}%d+{c}%d" % (P_GPR, P_VAC, P_RUBS, P_OTHER),
         CURRENCY, "total"),
        (P_OPEX, "Total Operating Expenses", "=SUM({c}%d:{c}%d)" % (P_TAX, P_RES), CURRENCY, "total"),
        (P_NOI, "Net Operating Income (NOI)", "={c}%d-{c}%d" % (P_EGI, P_OPEX), CURRENCY, "result"),
        (P_DS, "Annual Debt Service", f"={UW}!$D${R_RATE}", CURRENCY, "link"),
        (P_CF, "Net Leveraged Cash Flow", "={c}%d-{c}%d" % (P_NOI, P_DS), CURRENCY, "result"),
        (P_COC, "Leveraged Cash-on-Cash Return",
         f"=IF({UW}!$D${R_TERM}=0,0,{{c}}{P_CF}/{UW}!$D${R_TERM})", PERCENT, "result"),
        (P_DSCR, "Debt Service Coverage Ratio (DSCR)", "=IF({c}%d=0,0,{c}%d/{c}%d)" % (P_DS, P_NOI, P_DS),
         MULTIPLE, "result"),
        (P_CUM, "Cumulative Cash Flow", None, CURRENCY, "result"),
    ]
    for row, text, template, number_format, style in calc_rows:
        fill = soft_gray if style == "total" else accent_blue if style == "result" else None
        border = border_total if style == "total" else border_cell
        label(ws2, row, text, bold=True, fill=fill, border=border)
        for i, col in enumerate(years):
            if row == P_CUM:
                value = f"=B{P_CF}" if i == 0 else f"={years[i - 1]}{P_CUM}+{col}{P_CF}"
            else:
                value = template.replace("{c}", col)
            put(ws2, f"{col}{row}", value, number_format, font_link if style == "link" else font_bold,
                fill=fill, border=border)

    # ---- Year-5 exit & returns analysis -----------------------------------
    ws2.merge_cells(f"A{P_EXIT_CAP - 2}:F{P_EXIT_CAP - 2}")
    ws2[f"A{P_EXIT_CAP - 2}"] = "YEAR-5 EXIT & INVESTOR RETURNS"
    ws2[f"A{P_EXIT_CAP - 2}"].font = font_section
    header_row(ws2, P_EXIT_CAP - 1, ["Exit Parameter", "Value", "", "", "", ""])
    loan, rate_, term = f"{UW}!D{R_LTV}", f"{UW}!B{R_RATE}", f"{UW}!B{R_TERM}"
    exit_rows = [
        (P_EXIT_CAP, "Exit Capitalization Rate", 0.085, PERCENT, font_input,
         "User-set exit cap. Compare with the going-in cap on Tab 1 (current NOI / purchase price)."),
        (P_SELL, "Selling Costs (% of Sale Price)", 0.03, PERCENT, font_input, "Broker, legal and closing costs."),
        (P_SALE, "Projected Sale Price (Year-5 NOI / Exit Cap)", f"=IF(B{P_EXIT_CAP}=0,0,F{P_NOI}/B{P_EXIT_CAP})",
         CURRENCY, font_bold, None),
        (P_COSTS, "Less: Selling Costs", f"=B{P_SALE}*B{P_SELL}", CURRENCY, font_bold, None),
        (P_BAL, "Less: Remaining Loan Balance (Year 5)",
         f"=-FV({rate_}/12,60,-PMT({rate_}/12,{term}*12,-{loan}),{loan})", CURRENCY, font_bold,
         "Principal still owed after 60 monthly payments."),
        (P_NET, "Net Sale Proceeds to Equity", f"=B{P_SALE}-B{P_COSTS}-B{P_BAL}", CURRENCY, font_bold, None),
        (P_EQ, "Total Cash Equity Invested", f"={UW}!D{R_TERM}", CURRENCY, font_link, None),
        (P_PROFIT, "Total Profit (Cash Flow + Sale - Equity)", f"=F{P_CUM}+B{P_NET}-B{P_EQ}", CURRENCY,
         font_bold, None),
        (P_EM, "Equity Multiple", f"=IF(B{P_EQ}=0,0,(F{P_CUM}+B{P_NET})/B{P_EQ})", MULTIPLE, font_bold,
         "> 2.0x is a strong 5-year hold."),
        (P_IRR, "Levered IRR (5-Year Hold)", f"=IRR(B{P_STRIP}:G{P_STRIP})", PERCENT, font_bold,
         "> 15% is a strong value-add IRR."),
    ]
    for row, text, value, number_format, font, comment in exit_rows:
        label(ws2, row, text, bold=row in (P_NET, P_EM, P_IRR))
        put(ws2, f"B{row}", value, number_format, font)
        if comment:
            ws2.cell(row=row, column=3, value=comment).font = font_note
    for row in (P_NET, P_EM, P_IRR):
        for col in "AB":
            ws2[f"{col}{row}"].fill = accent_green
    ws2.cell(row=P_EXIT_CAP, column=4, value="Going-in cap:").font = font_note
    put(ws2, f"E{P_EXIT_CAP}", f"=IF({UW}!B{R_PRICE}=0,0,{UW}!B{R_NOI}/{UW}!B{R_PRICE})", PERCENT, font_link)

    # IRR cash-flow strip: Year 0 equity out, Years 1-5 cash flow, sale in Year 5
    ws2.merge_cells(f"A{P_STRIP - 2}:G{P_STRIP - 2}")
    ws2[f"A{P_STRIP - 2}"] = "LEVERED CASH FLOW STRIP (FEEDS IRR)"
    ws2[f"A{P_STRIP - 2}"].font = font_section
    header_row(ws2, P_STRIP - 1, ["Period", "Year 0 (Close)", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5 + Sale"])
    label(ws2, P_STRIP, "Net Cash to / (from) Investor", bold=True)
    strip = [f"=-B{P_EQ}"] + [f"={c}{P_CF}" for c in "BCDE"] + [f"=F{P_CF}+B{P_NET}"]
    for col, formula in zip("BCDEFG", strip):
        put(ws2, f"{col}{P_STRIP}", formula, fill=accent_blue)

    ws2.column_dimensions["A"].width = 50
    for col in "BCDEFG":
        ws2.column_dimensions[col].width = 20
    ws2.freeze_panes = f"B{P_HDR + 1}"

    # =========================================================================
    # TAB 3: SENSITIVITY
    # =========================================================================
    ws3 = wb.create_sheet(title="Sensitivity")
    ws3.sheet_view.showGridLines = True
    banner(ws3, "A1:I1", "DEAL SENSITIVITY ANALYSIS")
    note(ws3, "A2", "Each grid cell re-runs the full 5-year hold (Year-1 ramp included) for that scenario; everything "
                    "not on a grid's axes comes from the other tabs. The outlined cell is the base case.", "I2")

    steps = [-2, -1, 0, 1, 2]
    grid_cols = "BCDEF"
    n_cells = len(steps) ** 2

    GRID12_AXES, GRID3_AXES, GRID3_TOP, GRID4_AXES, GRID4_TOP = 4, 25, 30, 39, 44
    ENGINE1_TOP = 53
    ENGINE2_TOP = ENGINE1_TOP + n_cells + 4
    ENGINE3_TOP = ENGINE2_TOP + n_cells + 4

    def axis_block(first_row, title, rows):
        if title:
            ws3.merge_cells(start_row=first_row - 1, start_column=1, end_row=first_row - 1, end_column=6)
            ws3.cell(row=first_row - 1, column=1, value=title).font = font_section
        for k, (text, value, font, number_format, comment) in enumerate(rows):
            r = first_row + k
            ws3.cell(row=r, column=1, value=text).font = font_regular
            put(ws3, f"B{r}", value, number_format, font)
            ws3.cell(row=r, column=3, value=comment).font = font_note
        return [f"$B${first_row + k}" for k in range(4)]

    def engine_row(engine_top, i, j):
        return engine_top + 2 + i * len(steps) + j

    def sensitivity_table(top, title, corner_text, axes, axis_formats, engine_top, cell_formula, number_format):
        row_base, row_step, col_base, col_step = axes
        row_fmt, col_fmt = axis_formats
        ws3.merge_cells(start_row=top, start_column=1, end_row=top, end_column=6)
        ws3.cell(row=top, column=1, value=title).font = font_section
        hdr = top + 1
        ws3.row_dimensions[hdr].height = 30
        corner = ws3.cell(row=hdr, column=1, value=corner_text)
        corner.font = font_header
        corner.fill = navy_header
        corner.alignment = Alignment(wrap_text=True, vertical="center")
        for j, col in enumerate(grid_cols):
            c = put(ws3, f"{col}{hdr}", f"={col_base}+({steps[j]})*{col_step}", col_fmt, font_header,
                    fill=navy_header, border=None)
            c.alignment = Alignment(horizontal="center", vertical="center")
        for i in range(len(steps)):
            r = hdr + 1 + i
            c = put(ws3, f"A{r}", f"={row_base}+({steps[i]})*{row_step}", row_fmt, font_header,
                    fill=navy_header, border=None)
            c.alignment = Alignment(horizontal="center")
            for j, col in enumerate(grid_cols):
                c = put(ws3, f"{col}{r}", cell_formula(engine_row(engine_top, i, j)), number_format,
                        border=border_base if (steps[i], steps[j]) == (0, 0) else border_cell)
                c.alignment = Alignment(horizontal="center")
        ws3.conditional_formatting.add(f"B{hdr + 1}:F{hdr + len(steps)}", ColorScaleRule(
            start_type="min", start_color="F8CBAD", mid_type="percentile", mid_value=50, mid_color="FFF2CC",
            end_type="max", end_color="C6EFCE"))
        return hdr

    ws3.merge_cells("A3:F3")
    ws3["A3"] = "SENSITIVITY AXES - GRIDS 1 & 2"
    ws3["A3"].font = font_section
    axes12 = axis_block(GRID12_AXES, None, [
        ("Exit Cap Rate - Base Case", f"={P}!B{P_EXIT_CAP}", font_link, "0.00%",
         "From 5-Year Projections (Exit Capitalization Rate)."),
        ("Exit Cap Rate - Step", 0.005, font_input, "0.00%", "Spacing between rows."),
        ("Annual Rent Growth - Base Case", f"={P}!B{P_RENT_G}", font_link, "0.00%",
         "From 5-Year Projections (Annual Rental Growth Rate)."),
        ("Annual Rent Growth - Step", 0.01, font_input, "0.00%", "Spacing between columns."),
    ])
    irr_hdr = sensitivity_table(
        9, "1) LEVERED IRR (5-YEAR HOLD) - EXIT CAP vs. RENT GROWTH", "Exit Cap (rows) / Rent Growth (columns)",
        axes12, ("0.00%", "0.0%"), ENGINE1_TOP, lambda er: f"=IRR(D{er}:I{er})", "0.0%")
    sensitivity_table(
        17, "2) EQUITY MULTIPLE (5-YEAR HOLD) - EXIT CAP vs. RENT GROWTH", "Exit Cap (rows) / Rent Growth (columns)",
        axes12, ("0.00%", "0.0%"), ENGINE1_TOP,
        lambda er: f"=IF({P}!$B${P_EQ}=0,0,SUM(E{er}:I{er})/{P}!$B${P_EQ})", MULTIPLE)

    axes3 = axis_block(GRID3_AXES, None, [
        ("Stabilized GPR - Base Case", f"={UW}!C{R_GPR}", font_link, CURRENCY,
         "From Underwriting & Debt (Stabilized Gross Potential Rent)."),
        ("Stabilized GPR - Step", 30000, font_input, CURRENCY,
         "Spacing between rows. At $30k the lowest row equals today's $180k rent (rent bump fails)."),
        ("Purchase Price - Base Case", f"={UW}!B{R_PRICE}", font_link, CURRENCY,
         "From Underwriting & Debt (Purchase Price)."),
        ("Purchase Price - Step", 100000, font_input, CURRENCY, "Spacing between columns."),
    ])
    rent_hdr = sensitivity_table(
        GRID3_TOP, "3) LEVERED IRR (5-YEAR HOLD) - STABILIZED RENT vs. PURCHASE PRICE",
        "Stabilized GPR (rows) / Purchase Price (columns)", axes3, (CURRENCY, CURRENCY),
        ENGINE2_TOP, lambda er: f"=IRR(H{er}:M{er})", "0.0%")
    note(ws3, f"A{GRID3_TOP + 7}", "Purchase price also moves the loan (same LTV), debt service, equity and Year-5 "
                                   "loan balance. Year 1 still ramps toward the scenario's stabilized rent.")

    axes4 = axis_block(GRID4_AXES, None, [
        ("Utility Savings - Base Case", f"={UW}!B{R_UTIL}-{UW}!C{R_UTIL}", font_link, CURRENCY,
         "Current minus stabilized Master-Metered Utilities on Underwriting & Debt."),
        ("Utility Savings - Step", 7500, font_input, CURRENCY,
         "Spacing between rows. At $7.5k the lowest row is $0 savings (utilities stay at today's cost)."),
        ("Exit Cap Rate - Base Case", f"={P}!B{P_EXIT_CAP}", font_link, "0.00%",
         "From 5-Year Projections (Exit Capitalization Rate)."),
        ("Exit Cap Rate - Step", 0.005, font_input, "0.00%", "Spacing between columns."),
    ])
    util_hdr = sensitivity_table(
        GRID4_TOP, "4) LEVERED IRR (5-YEAR HOLD) - UTILITY SAVINGS vs. EXIT CAP",
        "Utility Savings (rows) / Exit Cap (columns)", axes4, (CURRENCY, "0.00%"),
        ENGINE3_TOP, lambda er: f"=IRR(F{er}:K{er})", "0.0%")
    note(ws3, f"A{GRID4_TOP + 7}", "Savings come off today's Master-Metered Utilities (floored at $0 cost); Year 1 "
                                   "captures the ramp % of them. Everything else stays at its model value.")

    def engine_block(top, title, headers, rows):
        ws3.merge_cells(start_row=top, start_column=1, end_row=top, end_column=len(headers))
        ws3.cell(row=top, column=1, value=title).font = font_section
        header_row(ws3, top + 1, headers)
        for r, cells, formats in rows:
            for k, value in enumerate(cells, 1):
                c = ws3.cell(row=r, column=k, value=value)
                c.font = font_regular
                c.border = border_cell
                c.number_format = formats.get(k, CURRENCY)

    # Shared references
    rent_g, exp_g, ramp_ = f"{P}!$B${P_RENT_G}", f"{P}!$B${P_EXP_G}", f"{P}!$B${P_RAMP}"
    egi1, opex1, noi1 = f"{P}!$B${P_EGI}", f"{P}!$B${P_OPEX}", f"{P}!$B${P_NOI}"      # Year 1 (ramped)
    egi_s, opex_s = f"{UW}!$C${R_EGI}", f"{UW}!$C${R_OPEX}"                          # stabilized
    debt, sell, bal, equity = f"{P}!$B${P_DS}", f"{P}!$B${P_SELL}", f"{P}!$B${P_BAL}", f"{P}!$B${P_EQ}"
    exit_cap = f"{P}!$B${P_EXIT_CAP}"

    def sale(noi5, cap):
        return f"IF({cap}<=0,0,{noi5}/{cap}*(1-{sell}))"

    # ---- Engine A: exit cap x rent growth (feeds grids 1 and 2) ----------
    rows1 = []
    for i in range(len(steps)):
        for j, gcol in enumerate(grid_cols):
            r = engine_row(ENGINE1_TOP, i, j)
            cap, g = f"$B{r}", f"$C{r}"

            def noi(n, g=g):
                return noi1 if n == 1 else f"({egi_s}*(1+{g})^{n - 1}-{opex_s}*(1+{exp_g})^{n - 1})"

            cells = ([f"Cap {i + 1} / Growth {j + 1}", f"=$A${irr_hdr + 1 + i}", f"={gcol}${irr_hdr}", f"=-{equity}"]
                     + [f"={noi(n)}-{debt}" for n in range(1, 5)]
                     + [f"={noi(5)}-{debt}+{sale(noi(5), cap)}-{bal}"])
            rows1.append((r, cells, {2: "0.00%", 3: "0.0%"}))
    engine_block(ENGINE1_TOP, "ENGINE A - EXIT CAP x RENT GROWTH (feeds grids 1 & 2 - no inputs here)",
                 ["Scenario", "Exit Cap", "Rent Growth", "Year 0 (Close)",
                  "Year 1", "Year 2", "Year 3", "Year 4", "Year 5 + Sale"], rows1)

    # ---- Engine B: stabilized rent x purchase price (feeds grid 3) -------
    ltv, rate_a, term_a, capex = (f"{UW}!$B${R_LTV}", f"{UW}!$B${R_RATE}", f"{UW}!$B${R_TERM}",
                                  f"{UW}!$B${R_CAPEX}")
    gpr_s, vac_s, vac1 = f"{UW}!$C${R_GPR}", f"{UW}!$C${R_VAC_PCT}", f"{P}!$B${P_VAC_PCT}"
    rows2 = []
    for i in range(len(steps)):
        for j, pcol in enumerate(grid_cols):
            r = engine_row(ENGINE2_TOP, i, j)
            delta = f"($C{r}-{gpr_s})"  # scenario stabilized GPR minus model stabilized GPR

            def noi(n, delta=delta):
                if n == 1:
                    return f"({egi1}+{delta}*{ramp_}*(1-{vac1})-{opex1})"
                return f"(({egi_s}+{delta}*(1-{vac_s}))*(1+{rent_g})^{n - 1}-{opex_s}*(1+{exp_g})^{n - 1})"

            cells = [
                f"Rent {i + 1} / Price {j + 1}",
                f"={pcol}${rent_hdr}",                                         # B purchase price
                f"=$A${rent_hdr + 1 + i}",                                     # C stabilized GPR
                f"=B{r}*{ltv}",                                                # D loan
                f"=PMT({rate_a}/12,{term_a}*12,-D{r})*12",                     # E annual debt service
                f"=(B{r}-D{r})+{capex}",                                       # F equity
                f"=-FV({rate_a}/12,60,-PMT({rate_a}/12,{term_a}*12,-D{r}),D{r})",  # G Year-5 balance
                f"=-F{r}",                                                     # H Year 0
            ] + [f"={noi(n)}-E{r}" for n in range(1, 5)] + [
                f"={noi(5)}-E{r}+{sale(noi(5), exit_cap)}-G{r}"]
            rows2.append((r, cells, {}))
    engine_block(ENGINE2_TOP, "ENGINE B - STABILIZED RENT x PURCHASE PRICE (feeds grid 3 - no inputs here)",
                 ["Scenario", "Purchase Price", "Stabilized GPR", "Loan", "Debt Service", "Equity",
                  "Yr-5 Loan Bal.", "Year 0 (Close)", "Year 1", "Year 2", "Year 3", "Year 4",
                  "Year 5 + Sale"], rows2)

    # ---- Engine C: utility savings x exit cap (feeds grid 4) -------------
    util_cur, util_s = f"{UW}!$B${R_UTIL}", f"{UW}!$C${R_UTIL}"
    rows3 = []
    for i in range(len(steps)):
        for j, ccol in enumerate(grid_cols):
            r = engine_row(ENGINE3_TOP, i, j)

            def noi(n, r=r):
                if n == 1:
                    return f"({egi1}-({opex1}+($D{r}-{util_s})*{ramp_}))"
                return f"({egi_s}*(1+{rent_g})^{n - 1}-$E{r}*(1+{exp_g})^{n - 1})"

            cells = [
                f"Savings {i + 1} / Cap {j + 1}",
                f"=$A${util_hdr + 1 + i}",                                     # B utility savings
                f"={ccol}${util_hdr}",                                         # C exit cap
                f"=MAX(0,{util_cur}-B{r})",                                    # D stabilized utilities
                f"={opex_s}-{util_s}+D{r}",                                    # E stabilized OpEx
                f"=-{equity}",                                                 # F Year 0
            ] + [f"={noi(n)}-{debt}" for n in range(1, 5)] + [
                f"={noi(5)}-{debt}+{sale(noi(5), f'$C{r}')}-{bal}"]
            rows3.append((r, cells, {3: "0.00%"}))
    engine_block(ENGINE3_TOP, "ENGINE C - UTILITY SAVINGS x EXIT CAP (feeds grid 4 - no inputs here)",
                 ["Scenario", "Utility Savings", "Exit Cap", "Stab. Utilities", "Stab. OpEx", "Year 0 (Close)",
                  "Year 1", "Year 2", "Year 3", "Year 4", "Year 5 + Sale"], rows3)

    ws3.column_dimensions["A"].width = 40
    for col in "BCDEFGHIJKLM":
        ws3.column_dimensions[col].width = 16

    wb.save(output_path)
    return output_path


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "WealthPreneurs_Underwriting_Dashboard.xlsx"
    print(f"Saved: {create_advanced_underwriting_dashboard(out)}")
