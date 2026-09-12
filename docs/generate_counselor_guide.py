from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image as PdfImage
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parent
IMAGE_DIR = ROOT / "辅导员使用说明配图"
ANNOTATED_DIR = IMAGE_DIR / "标注版"
OUTPUT = ROOT / "泉师智辅（东海校区）辅导员快速使用说明.docx"
PDF_OUTPUT = ROOT / "辅导员使用说明导出" / "泉师智辅（东海校区）辅导员快速使用说明.pdf"

TEAL = "176E78"
DARK = "173945"
MUTED = "63767D"
LIGHT = "E9F4F2"
AMBER = "F29F3D"


def font(size: int):
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def annotate(filename: str, points: list[tuple[int, int, int]]) -> Path:
    source = IMAGE_DIR / filename
    image = Image.open(source).convert("RGBA")
    draw = ImageDraw.Draw(image, "RGBA")
    number_font = font(24)
    for number, x, y in points:
        radius = 20
        draw.ellipse((x - radius - 4, y - radius - 4, x + radius + 4, y + radius + 4), fill=(255, 255, 255, 235))
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(226, 77, 67, 255), outline=(255, 255, 255, 255), width=2)
        label = str(number)
        box = draw.textbbox((0, 0), label, font=number_font)
        draw.text((x - (box[2] - box[0]) / 2, y - (box[3] - box[1]) / 2 - 2), label, font=number_font, fill="white")
    ANNOTATED_DIR.mkdir(parents=True, exist_ok=True)
    target = ANNOTATED_DIR / filename
    image.convert("RGB").save(target, quality=92)
    return target


def set_cell_shading(cell, fill: str):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=100, start=130, bottom=100, end=130):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def add_run(paragraph, text, bold=False, size=10.5, color=DARK):
    run = paragraph.add_run(text)
    run.bold = bold
    run.font.name = "微软雅黑"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "微软雅黑")
    run.font.size = Pt(size)
    run.font.color.rgb = RGBColor.from_string(color)
    return run


def add_bullet(doc, text: str, level=0):
    paragraph = doc.add_paragraph(style="List Bullet" if level == 0 else "List Bullet 2")
    paragraph.paragraph_format.space_after = Pt(3)
    paragraph.paragraph_format.line_spacing = 1.25
    add_run(paragraph, text)
    return paragraph


def add_numbered(doc, lead: str, text: str):
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_after = Pt(4)
    paragraph.paragraph_format.line_spacing = 1.3
    add_run(paragraph, lead, bold=True, color=TEAL)
    add_run(paragraph, text)
    return paragraph


def add_heading(doc, text: str, level=1):
    paragraph = doc.add_heading(text, level=level)
    paragraph.paragraph_format.space_before = Pt(8 if level == 1 else 5)
    paragraph.paragraph_format.space_after = Pt(6)
    for run in paragraph.runs:
        run.font.name = "微软雅黑"
        run._element.rPr.rFonts.set(qn("w:eastAsia"), "微软雅黑")
        run.font.color.rgb = RGBColor.from_string(TEAL if level == 1 else DARK)
    return paragraph


def add_callout_table(doc, items: list[tuple[str, str]]):
    table = doc.add_table(rows=0, cols=2)
    table.autofit = False
    table.columns[0].width = Cm(2.1)
    table.columns[1].width = Cm(22.8)
    for number, explanation in items:
        cells = table.add_row().cells
        cells[0].width = Cm(2.1)
        cells[1].width = Cm(22.8)
        cells[0].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        cells[1].vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        set_cell_shading(cells[0], TEAL)
        set_cell_shading(cells[1], "F5F9F8")
        set_cell_margins(cells[0])
        set_cell_margins(cells[1])
        p0 = cells[0].paragraphs[0]
        p0.alignment = WD_ALIGN_PARAGRAPH.CENTER
        add_run(p0, number, bold=True, size=11, color="FFFFFF")
        add_run(cells[1].paragraphs[0], explanation, size=10)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)


def add_screenshot(doc, path: Path, caption: str):
    paragraph = doc.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_after = Pt(3)
    paragraph.add_run().add_picture(str(path), width=Cm(20.0))
    cap = doc.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.paragraph_format.space_after = Pt(5)
    add_run(cap, caption, size=8.5, color=MUTED)


def page_break(doc):
    doc.add_page_break()


def build_pdf(images: dict[str, Path]):
    PDF_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdfmetrics.registerFont(TTFont("GuideCN", "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"))
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("GuideTitle", parent=styles["Title"], fontName="GuideCN", fontSize=26, leading=36, textColor=colors.HexColor("#173945"), alignment=TA_CENTER)
    subtitle_style = ParagraphStyle("GuideSubtitle", parent=styles["Heading1"], fontName="GuideCN", fontSize=18, leading=25, textColor=colors.HexColor("#176E78"), alignment=TA_CENTER)
    h1 = ParagraphStyle("GuideH1", parent=styles["Heading1"], fontName="GuideCN", fontSize=17, leading=23, textColor=colors.HexColor("#176E78"), spaceAfter=8)
    h2 = ParagraphStyle("GuideH2", parent=styles["Heading2"], fontName="GuideCN", fontSize=12, leading=18, textColor=colors.HexColor("#173945"), spaceBefore=6, spaceAfter=3)
    body = ParagraphStyle("GuideBody", parent=styles["BodyText"], fontName="GuideCN", fontSize=9.5, leading=15, textColor=colors.HexColor("#253E47"), spaceAfter=4)
    small = ParagraphStyle("GuideSmall", parent=body, fontSize=8, leading=12, textColor=colors.HexColor("#63767D"))
    number = ParagraphStyle("GuideNumber", parent=body, fontSize=10, leading=14, textColor=colors.white, alignment=TA_CENTER)

    def footer(canvas, document):
        canvas.saveState()
        canvas.setFont("GuideCN", 7.5)
        canvas.setFillColor(colors.HexColor("#63767D"))
        canvas.drawString(18 * mm, 8 * mm, "泉师智辅 · 东海校区")
        canvas.drawRightString(279 * mm, 8 * mm, f"辅导员快速使用说明　{document.page}")
        canvas.restoreState()

    def screenshot_for_pdf(path: Path, max_width=246 * mm, max_height=118 * mm):
        """Keep browser screenshots legible without stretching their aspect ratio."""
        with Image.open(path) as source:
            pixel_width, pixel_height = source.size
        scale = min(max_width / pixel_width, max_height / pixel_height)
        picture = PdfImage(str(path), width=pixel_width * scale, height=pixel_height * scale)
        picture.hAlign = "CENTER"
        return picture

    story = []
    story += [Spacer(1, 42 * mm), Paragraph("QUANSHI ZHIFU · DONGHAI CAMPUS", subtitle_style), Spacer(1, 8 * mm),
              Paragraph("泉师智辅（东海校区）", title_style), Paragraph("辅导员快速使用说明", subtitle_style), Spacer(1, 15 * mm),
              Paragraph("学生与班级管理　｜　学生留言处理　｜　校务知识问答　｜　资料导入　｜　工作总结", ParagraphStyle("CoverBody", parent=body, alignment=TA_CENTER, fontSize=11)),
              Spacer(1, 14 * mm), Paragraph("访问地址：http://47.100.49.58/", ParagraphStyle("CoverURL", parent=subtitle_style, fontSize=13)),
              Paragraph("使用管理员分配的教师账号登录；建议使用最新版 Chrome 或 Edge 浏览器。", ParagraphStyle("CoverNote", parent=small, alignment=TA_CENTER)), PageBreak()]

    story += [Paragraph("一、首次登录：系统会自动识别身份", h1),
              Paragraph("在统一登录页输入管理员分配的教师账号和密码。登录后会自动进入教师工作台，不需要手动选择身份。", body),
              screenshot_for_pdf(images["login"]), Spacer(1, 2 * mm)]
    login_rows = [[Paragraph(number_text, number), Paragraph(explanation, small)] for number_text, explanation in [
        ("1", "账号：填写管理员创建的教师登录账号。"),
        ("2", "密码：填写初始密码；忘记密码时联系管理员重置。"),
        ("3", "点击“登录并进入”；系统会根据账号自动进入教师、学生或管理员界面。"),
    ]]
    login_legend = Table(login_rows, colWidths=[12 * mm, 234 * mm])
    login_legend.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#176E78")), ("BACKGROUND", (1, 0), (1, -1), colors.HexColor("#F5F9F8")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BOX", (0, 0), (-1, -1), .35, colors.HexColor("#D6E3E1")), ("INNERGRID", (0, 0), (-1, -1), .25, colors.HexColor("#D6E3E1")), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("LEFTPADDING", (1, 0), (1, -1), 8)]))
    story += [login_legend, Spacer(1, 3 * mm), Paragraph("建议首次登录后先进入“平台设置”，确认模型状态显示为“已连接”。", ParagraphStyle("LoginTip", parent=body, fontSize=10.5, leading=17, textColor=colors.HexColor("#9A5B00"), backColor=colors.HexColor("#FFF7E8"), borderPadding=7)), PageBreak()]

    story += [Paragraph("二、先看这一页：最简使用顺序", h1),
              Paragraph("登录 → 导入学生 → 上传学校资料 → 查看学生诉求 → 使用智能助手 → 导出统计报告。", ParagraphStyle("Flow", parent=body, fontSize=13, leading=21, textColor=colors.HexColor("#176E78"), spaceAfter=10))]
    flow_data = [[
        Paragraph("1<br/><b>学生与班级</b><br/><font size='8'>建班、导入学生并创建账号</font>", body),
        Paragraph("2<br/><b>智能资料导入</b><br/><font size='8'>上传表格、Word、PDF或截图</font>", body),
        Paragraph("3<br/><b>泉师知识库</b><br/><font size='8'>确认资料范围与检索状态</font>", body),
        Paragraph("4<br/><b>学生诉求中心</b><br/><font size='8'>处理尚未解决的原话</font>", body),
        Paragraph("5<br/><b>智能助手／统计</b><br/><font size='8'>生成材料、待办与总结</font>", body),
    ]]
    flow_table = Table(flow_data, colWidths=[49 * mm] * 5, rowHeights=[34 * mm])
    flow_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#E9F4F2")), ("BOX", (0, 0), (-1, -1), .6, colors.HexColor("#CFE0DD")), ("INNERGRID", (0, 0), (-1, -1), .4, colors.white), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8)]))
    story += [flow_table, Spacer(1, 6 * mm), Paragraph("学生端与教师端如何配合", h2)]
    for line in [
        "• 学生选择“询问学校问题”时，智能体只依据已确认的知识资料回答。",
        "• 智能体已解决的问题不会进入教师待处理列表；学生选择“未解决”后，原问题才会转给教师。",
        "• 学生选择“给老师留言”时，内容不经过智能体代答，直接进入学生诉求中心。",
        "• 教师端默认只显示未解决原话；点击“显示全部原话”可查看已解决内容和完整状态。",
    ]:
        story.append(Paragraph(line, body))
    story += [Paragraph("建议每天做的三件事", h2),
              Paragraph("1. 上班后：进入“学生诉求中心”，先看未解决与紧急事项。", body),
              Paragraph("2. 工作中：用“智能助手”查制度、生成通知、拆分待办，重要操作仍由教师确认。", body),
              Paragraph("3. 下班前：在“统计与总结”查看数据并生成阶段报告。", body), PageBreak()]

    sections = [
        ("三、今日工作台：从这里开始", images["home"], [
            ("1", "左侧主导航：进入智能助手、学生诉求、学生与班级、资料导入、知识库、统计和迎新管理。"),
            ("2", "“唤起智能助手”：查询资料、生成通知、整理记录和创建待办。"),
            ("3", "“创建待办”：直接输入一句话；多项内容用顿号或换行分隔。"),
        ]),
        ("四、学生与班级：先建班，再导入学生", images["students"], [
            ("1", "“学生档案”：查看学生基础信息、状态与近期标签。"),
            ("2", "“批量添加学生”：上传多种文件，识别后核对再保存。"),
            ("3", "“学生账号”：查看开通情况，并可重置学生密码。"),
            ("4", "列表工具区：搜索、筛选、导出名册或继续批量添加。导入后默认账号为学号，密码为姓名拼音。"),
        ]),
        ("五、智能资料导入：文件可多选，也可直接拖入", images["imports"], [
            ("1", "三步流程：选择文件 → 识别与映射 → 校验保存。最后一步必须人工确认。"),
            ("2", "上传区：点击选择文件，或把多个表格、Word、PDF、PPT和聊天截图拖到此处。"),
            ("3", "保存规则：学生数据进入学生档案；知识内容进入资料库；原始文件保留在教师电脑。"),
        ]),
        ("六、泉师知识库：决定智能体能回答什么", images["knowledge"], [
            ("1", "页面顶部“上传资料”：进入上传流程。"),
            ("2", "列表区“上传资料”：作用相同，便于随时补充。"),
            ("3", "资料范围：通用资料可供其他教师与学生检索；教师专用资料仅上传教师本人可检索。"),
        ]),
        ("七、学生诉求中心：先看未解决内容", images["requests"], [
            ("1", "顶部状态统计：查看全部、未解决、处理中和已解决数量。"),
            ("2", "左侧筛选区：按姓名、学号、原话、班级和状态查找。"),
            ("3", "右侧详情区：连续留言按时间顺序合并展示，标题和摘要不替代学生原话。"),
        ]),
        ("八、诉求处理详情：原话、状态和回复都能核对", images["request_detail"], [
            ("1", "每一条学生原话单独显示“未解决”或“已解决”，避免把已处理内容再次列入待办。"),
            ("2", "“逐条核对完整对话”默认收起；需要查看全部上下文时再点击展开。"),
            ("3", "暂时无法办结时点击“标记处理中”，诉求会保留在当前工作队列。"),
            ("4", "填写处理结果后点击“回复并完成”，回复会显示在学生端。"),
        ]),
        ("九、智能助手：用自然语言完成日常工作", images["assistant"], [
            ("1", "“新建对话”：开始新的工作主题；聊天记录保留7天。"),
            ("2", "“切换模型”：在已配置的智谱或 DeepSeek 模型之间切换。"),
            ("3", "对话区：说清对象、时间、任务和输出格式；回答会优先使用平台资料与教师数据。"),
        ]),
        ("十、统计与总结：阶段工作一键汇总", images["reports"], [
            ("1", "“生成月度报告”：按平台真实数据生成可下载的阶段总结。"),
            ("2", "核心数据卡：查看本月办结、触达学生、当前未完成和知识资料数量。"),
            ("3", "业务总量：查看不同工作类型的占比。迎新事项另在“迎新管理”中维护。"),
        ]),
    ]
    for heading, image_path, items in sections:
        story.append(Paragraph(heading, h1))
        pic = screenshot_for_pdf(image_path)
        story += [pic, Spacer(1, 2 * mm)]
        rows = [[Paragraph(number_text, number), Paragraph(explanation, small)] for number_text, explanation in items]
        legend = Table(rows, colWidths=[12 * mm, 234 * mm])
        legend.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#176E78")), ("BACKGROUND", (1, 0), (1, -1), colors.HexColor("#F5F9F8")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("BOX", (0, 0), (-1, -1), .35, colors.HexColor("#D6E3E1")), ("INNERGRID", (0, 0), (-1, -1), .25, colors.HexColor("#D6E3E1")), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("LEFTPADDING", (1, 0), (1, -1), 8)]))
        story += [legend, PageBreak()]

    story.append(Paragraph("十一、常见问题", h1))
    faq = [
        ("学生问了问题，为什么教师端看不到？", "如果智能体已经根据知识库解决，问题不会进入教师待处理列表；只有学生选择“未解决”或直接留言时才会出现。"),
        ("同一学生多次留言会不会散落？", "短时间内的连续留言会合并到同一诉求卡片，教师可按顺序查看全部原话。"),
        ("智能体为什么说“此知识暂未学会”？", "当前可检索资料中没有足够依据。上传对应制度或通知、确认可见范围后，再让学生询问。"),
        ("导入学生后账号在哪里？", "进入“学生与班级 → 学生账号”查看。账号默认是学号，密码默认是姓名拼音，教师可以重置。"),
        ("文件上传后保存在哪里？", "学生数据进入平台数据库；提取后的知识文本进入资料库；教师上传的原始文件保留在教师电脑。"),
        ("页面数据没有立即出现怎么办？", "先点击刷新按钮或刷新浏览器；仍未恢复时，记录页面名称和操作时间并联系管理员。"),
    ]
    faq_rows = [[Paragraph("问题", h2), Paragraph("处理方法", h2)]] + [[Paragraph(q, body), Paragraph(a, body)] for q, a in faq]
    faq_table = Table(faq_rows, colWidths=[72 * mm, 174 * mm])
    faq_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#176E78")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#E9F4F2")), ("BACKGROUND", (1, 1), (1, -1), colors.HexColor("#F8FAFA")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOX", (0, 0), (-1, -1), .5, colors.HexColor("#CFE0DD")), ("INNERGRID", (0, 0), (-1, -1), .35, colors.HexColor("#D6E3E1")), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9)]))
    story += [faq_table, Spacer(1, 8 * mm), Paragraph("使用提醒：智能体负责检索、整理和生成建议；涉及学生认定、审批、心理处置等事项，最终仍由辅导员本人确认。", ParagraphStyle("Reminder", parent=body, fontSize=11, leading=18, textColor=colors.HexColor("#9A5B00"), backColor=colors.HexColor("#FFF7E8"), borderPadding=9))]

    document = SimpleDocTemplate(str(PDF_OUTPUT), pagesize=landscape(A4), leftMargin=18 * mm, rightMargin=18 * mm, topMargin=14 * mm, bottomMargin=14 * mm, title="泉师智辅（东海校区）辅导员快速使用说明", author="泉师智辅")
    document.build(story, onFirstPage=footer, onLaterPages=footer)


def build():
    images = {
        "login": annotate("01-统一登录-新版.png", [(1, 930, 327), (2, 930, 423), (3, 930, 503)]),
        "home": annotate("02-今日工作台-新版.png", [(1, 105, 315), (2, 1180, 170), (3, 1190, 500)]),
        "requests": annotate("03-学生诉求中心-新版.png", [(1, 625, 260), (2, 405, 455), (3, 955, 430)]),
        "request_detail": annotate("03B-诉求处理详情-新版.png", [(1, 1170, 288), (2, 1075, 472), (3, 1060, 610), (4, 1205, 610)]),
        "students": annotate("04-学生与班级.png", [(1, 520, 235), (2, 1380, 160), (3, 830, 235), (4, 1325, 447)]),
        "imports": annotate("05-智能资料导入-新版.png", [(1, 520, 236), (2, 615, 492), (3, 1105, 320)]),
        "knowledge": annotate("06-泉师知识库-新版.png", [(1, 1185, 170), (2, 1185, 360), (3, 1110, 505)]),
        "assistant": annotate("07-智能助手-新版.png", [(1, 380, 245), (2, 1185, 245), (3, 850, 500)]),
        "reports": annotate("09-统计与总结-新版.png", [(1, 1185, 170), (2, 670, 270), (3, 1120, 470)]),
    }

    doc = Document()
    section = doc.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width = Cm(29.7)
    section.page_height = Cm(21.0)
    section.top_margin = Cm(1.5)
    section.bottom_margin = Cm(1.4)
    section.left_margin = Cm(1.7)
    section.right_margin = Cm(1.7)

    styles = doc.styles
    styles["Normal"].font.name = "微软雅黑"
    styles["Normal"]._element.rPr.rFonts.set(qn("w:eastAsia"), "微软雅黑")
    styles["Normal"].font.size = Pt(10.5)

    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    add_run(header, "泉师智辅 · 东海校区", size=8, color=MUTED)
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_run(footer, "辅导员快速使用说明｜2026年9月", size=8, color=MUTED)

    cover_spacer = doc.add_paragraph()
    cover_spacer.paragraph_format.space_after = Pt(52)
    tag = doc.add_paragraph()
    tag.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_run(tag, "QUANSHI ZHIFU · DONGHAI CAMPUS", bold=True, size=11, color=TEAL)
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_before = Pt(12)
    title.paragraph_format.space_after = Pt(12)
    add_run(title, "泉师智辅（东海校区）", bold=True, size=30, color=DARK)
    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_run(subtitle, "辅导员快速使用说明", bold=True, size=20, color=TEAL)
    intro = doc.add_paragraph()
    intro.alignment = WD_ALIGN_PARAGRAPH.CENTER
    intro.paragraph_format.space_before = Pt(20)
    add_run(intro, "学生与班级管理｜学生留言处理｜校务知识问答｜资料导入｜工作总结", size=12, color=MUTED)
    url = doc.add_paragraph()
    url.alignment = WD_ALIGN_PARAGRAPH.CENTER
    url.paragraph_format.space_before = Pt(34)
    add_run(url, "访问地址：http://47.100.49.58/", bold=True, size=13, color=TEAL)
    note = doc.add_paragraph()
    note.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_run(note, "使用管理员分配的教师账号登录；建议使用最新版 Chrome 或 Edge 浏览器。", size=10, color=MUTED)

    page_break(doc)
    add_heading(doc, "一、先看这一页：日常使用顺序", 1)
    p = doc.add_paragraph()
    add_run(p, "最简使用路径：", bold=True, color=TEAL)
    add_run(p, " 登录 → 导入学生 → 上传学校资料 → 查看学生诉求 → 使用智能助手 → 导出统计报告。")
    flow = doc.add_table(rows=1, cols=5)
    flow.autofit = False
    steps = [
        ("1", "学生与班级", "建班、导入学生并创建账号"),
        ("2", "智能资料导入", "上传表格、Word、PDF或截图"),
        ("3", "泉师知识库", "确认资料范围与可检索状态"),
        ("4", "学生诉求中心", "只处理尚未解决的学生原话"),
        ("5", "智能助手／统计", "生成待办、材料与工作总结"),
    ]
    for index, (number, name, detail) in enumerate(steps):
        cell = flow.rows[0].cells[index]
        set_cell_shading(cell, LIGHT if index % 2 == 0 else "F5F9F8")
        set_cell_margins(cell, top=180, bottom=180)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        paragraph = cell.paragraphs[0]
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        add_run(paragraph, number + "\n", bold=True, size=18, color=TEAL)
        add_run(paragraph, name + "\n", bold=True, size=11, color=DARK)
        add_run(paragraph, detail, size=8.5, color=MUTED)
    add_heading(doc, "学生端与教师端如何配合", 2)
    add_bullet(doc, "学生选择“询问学校问题”时，智能体只依据已确认的知识资料回答。")
    add_bullet(doc, "智能体已解决的问题不会进入教师待处理列表；学生选择“未解决”后，原问题才会转给教师。")
    add_bullet(doc, "学生选择“给老师留言”时，内容不经过智能体代答，直接进入学生诉求中心。")
    add_bullet(doc, "教师端默认只显示未解决原话；点击“显示全部原话”可查看已解决内容和完整状态。")
    add_heading(doc, "建议每天做的三件事", 2)
    add_numbered(doc, "上班后：", "进入“学生诉求中心”，先看未解决与紧急事项。")
    add_numbered(doc, "工作中：", "用“智能助手”查制度、生成通知、拆分待办，重要操作仍由教师确认。")
    add_numbered(doc, "下班前：", "在“统计与总结”查看数据并生成阶段报告。")

    page_break(doc)
    add_heading(doc, "二、今日工作台：从这里开始", 1)
    add_screenshot(doc, images["home"], "图1　今日工作台（红色数字对应下方说明）")
    add_callout_table(doc, [
        ("1", "左侧主导航：依次进入智能助手、学生诉求、学生与班级、资料导入、知识库、统计和迎新管理。"),
        ("2", "“唤起智能助手”：快速进入对话，适合查询资料、生成通知、整理记录和创建待办。"),
        ("3", "“创建待办”：可直接输入一句话；多项内容用顿号或换行分隔，系统会拆分保存。"),
    ])

    page_break(doc)
    add_heading(doc, "三、学生与班级：先建班，再导入学生", 1)
    add_screenshot(doc, images["students"], "图2　学生与班级管理")
    add_callout_table(doc, [
        ("1", "“学生档案”：查看姓名、学号、班级、学院、联系方式、状态和近期标签。"),
        ("2", "“批量添加学生”：上传 Excel、CSV、Word、PDF 等资料，识别后先核对再保存。"),
        ("3", "“学生账号”：查看学生是否已开通账号，并可重置学生密码。"),
        ("4", "列表工具区：可搜索、筛选、导出名册，也可继续批量添加学生。"),
    ])
    add_bullet(doc, "批量导入学生后，平台会自动创建学生账号。默认账号为学号，默认密码为姓名拼音。")
    add_bullet(doc, "教师可自定义创建班级、修改班级名称；删除班级前应先确认班内没有仍需保留的学生。")

    page_break(doc)
    add_heading(doc, "四、智能资料导入：文件可多选，也可直接拖入", 1)
    add_screenshot(doc, images["imports"], "图3　智能资料导入")
    add_callout_table(doc, [
        ("1", "三步流程：选择文件 → 识别与映射 → 校验保存。不要跳过最后的人工确认。"),
        ("2", "上传区：点击选择文件，或把多个文件直接拖到此区域；支持表格、Word、PDF、PPT和聊天截图。"),
        ("3", "保存位置说明：学生数据进入学生档案；知识内容进入资料库；原始文件保留在教师电脑。"),
    ])
    add_bullet(doc, "学生名单、成绩表、奖助数据等结构化资料，应核对字段与学号后再保存。")
    add_bullet(doc, "制度、通知、手册等资料会被提取为可检索文本，避免每次问答都重新扫描整份 PDF。")
    add_bullet(doc, "扫描 PDF 或图片文字识别可能较慢；若识别结果不完整，先检查文件清晰度，再重新识别。")

    page_break(doc)
    add_heading(doc, "五、泉师知识库：决定智能体“能回答什么”", 1)
    add_screenshot(doc, images["knowledge"], "图4　泉师知识库")
    add_callout_table(doc, [
        ("1", "页面顶部“上传资料”：进入上传流程。"),
        ("2", "列表区“上传资料”：功能相同，适合在资料列表为空或需要继续补充时使用。"),
        ("3", "资料范围：普通通用资料可供其他教师与学生检索；教师专用资料仅上传教师本人可检索。"),
    ])
    add_heading(doc, "上传资料时的简单判断", 2)
    add_bullet(doc, "普遍通用：校级制度、学生手册、办事指南、校历、迎新交通、心理中心预约方式等。")
    add_bullet(doc, "教师专用：本班名单、个人谈话记录、班级内部材料、仅用于本人工作的文档。")
    add_bullet(doc, "学生问答只使用已确认且符合可见范围的资料；资料不足时，智能体会提示学生改为留言。")

    page_break(doc)
    add_heading(doc, "六、学生诉求中心：默认只处理未解决内容", 1)
    add_screenshot(doc, images["requests"], "图5　学生诉求中心")
    add_callout_table(doc, [
        ("1", "顶部状态统计：快速查看全部、未解决、处理中和已解决数量。"),
        ("2", "左侧筛选区：按姓名、学号、原话、班级和处理状态查找诉求。"),
        ("3", "右侧详情区：选择一条诉求后，查看未解决原话、完整对话，并填写回复或完成处理。"),
    ])
    add_heading(doc, "处理一条诉求的标准动作", 2)
    add_numbered(doc, "第1步：", "从左侧选择学生诉求；默认看到的就是需要教师处理的未解决原话。")
    add_numbered(doc, "第2步：", "如需核对上下文，点击“显示全部原话”或“逐条核对完整对话”。已解决内容会明确标注。")
    add_numbered(doc, "第3步：", "需要继续跟进时标记“处理中”；处理完成后填写回复并点击“回复并完成”。")
    add_bullet(doc, "同一学生在较短时间内的连续留言会合并到同一张卡片，消息顺序保持不变。")

    page_break(doc)
    add_heading(doc, "七、智能助手：用自然语言完成日常工作", 1)
    add_screenshot(doc, images["assistant"], "图6　教师智能助手")
    add_callout_table(doc, [
        ("1", "“新建对话”：开始一个新的工作主题；最近对话保留7天，过期自动清理。"),
        ("2", "“切换模型”：在已配置的智谱或 DeepSeek 模型之间切换。"),
        ("3", "对话区：直接说清对象、时间、任务和希望输出的格式；回答会优先使用平台资料与教师数据。"),
    ])
    add_heading(doc, "推荐提问方式", 2)
    add_bullet(doc, "“根据知识库中的学生手册，列出评优评先需要准备的材料。”")
    add_bullet(doc, "“帮我写一则发给化工1班的通知，主题是明天下午班会，语气简洁。”")
    add_bullet(doc, "“把这段工作安排拆成待办：明天核对名单、周五提交总结、下周回访三名学生。”")
    add_bullet(doc, "“汇总今天未解决的学生诉求，按紧急程度列出。”")

    page_break(doc)
    add_heading(doc, "八、统计、迎新与设置", 1)
    add_screenshot(doc, images["reports"], "图7　统计与总结")
    add_callout_table(doc, [
        ("1", "“生成月度报告”：按平台真实数据生成可下载的阶段总结。"),
        ("2", "核心数据卡：查看本月办结事项、触达学生、当前未完成工作和知识资料数量。"),
        ("3", "业务总量：查看不同类型工作所占比例，便于安排时间和撰写总结。"),
    ])
    add_bullet(doc, "迎新管理用于发布新生事项、查看准备进度和补充迎新文章；非迎新阶段可减少使用。")
    add_bullet(doc, "平台设置用于填写模型 Key 并选择智谱或 DeepSeek 模型。Key 不要通过微信群或公开文件传播。")

    page_break(doc)
    add_heading(doc, "九、常见问题", 1)
    faq = [
        ("学生问了问题，为什么教师端看不到？", "如果智能体已经根据知识库解决，问题不会进入教师待处理列表；只有学生选择“未解决”或直接留言时才会出现。"),
        ("同一学生多次留言会不会散落？", "短时间内的连续留言会合并到同一诉求卡片，教师可按顺序查看全部学生原话。"),
        ("为什么智能体回答“此知识暂未学会”？", "说明当前可检索资料中没有足够依据。请先把对应制度或通知上传知识库、确认可见范围，再让学生重新询问。"),
        ("导入学生后账号在哪里？", "进入“学生与班级 → 学生账号”查看。账号默认是学号，密码默认是姓名拼音，教师可以重置。"),
        ("文件上传后保存在哪里？", "结构化学生数据进入平台数据库；提取后的知识文本进入资料库；教师上传的原始文件保留在教师电脑。"),
        ("页面数据没有立即出现怎么办？", "先点击页面刷新按钮或刷新浏览器；仍未恢复时，记录页面名称和操作时间并联系管理员。"),
    ]
    table = doc.add_table(rows=0, cols=2)
    table.autofit = False
    for question, answer in faq:
        cells = table.add_row().cells
        cells[0].width = Cm(8)
        cells[1].width = Cm(17)
        set_cell_shading(cells[0], LIGHT)
        set_cell_shading(cells[1], "F8FAFA")
        set_cell_margins(cells[0], top=170, bottom=170)
        set_cell_margins(cells[1], top=170, bottom=170)
        add_run(cells[0].paragraphs[0], question, bold=True, size=10, color=TEAL)
        add_run(cells[1].paragraphs[0], answer, size=10)
    doc.add_paragraph()
    reminder = doc.add_table(rows=1, cols=1).cell(0, 0)
    set_cell_shading(reminder, "FFF7E8")
    set_cell_margins(reminder, top=180, bottom=180)
    add_run(reminder.paragraphs[0], "使用提醒：", bold=True, size=11, color=AMBER)
    add_run(reminder.paragraphs[0], "智能体负责检索、整理和生成建议，涉及学生认定、审批、心理处置等事项，最终仍由辅导员本人确认。", size=11)

    doc.save(OUTPUT)
    build_pdf(images)
    print(OUTPUT)
    print(PDF_OUTPUT)


if __name__ == "__main__":
    build()
