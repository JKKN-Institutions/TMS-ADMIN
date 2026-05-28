# JKKN Terminology Dictionary

This reference contains the complete JKKN terminology standards for use across all applications, documentation, UI/UX, communications, and code.

## Terminology Priority Levels

### Level 1: Critical Terms (Zero Tolerance)
These terms MUST be replaced in ALL contexts. Never use the prohibited terms.

### Level 2: Highly Encouraged Terms
These terms SHOULD be replaced whenever possible for consistency.

### Level 3: Recommended Terms
These terms are preferred but have more flexibility based on context.

---

## Critical Terms (Zero Tolerance)

### People & Community

| Category | NEVER Use | ALWAYS Use | Context Notes |
|----------|-----------|------------|---------------|
| Learner Community | students, pupils, kids, children, trainees, student body | learners, young learners | Use "young learners" only when age context is specifically needed |
| Teaching Staff (Academic) | faculty, teachers, professors, instructors, tutors, educators | learning facilitators | For academic/teaching roles |
| Non-Academic Staff | staff, employees, workers | team members | For administrative and support roles |
| Parents/Guardians | parents, guardians | learning partners, family partners | Emphasizes collaborative relationship |

### Spaces & Facilities

| Category | NEVER Use | ALWAYS Use | Context Notes |
|----------|-----------|------------|---------------|
| General Learning Spaces | classrooms, rooms | learning studios | Standard learning spaces |
| Large Venues | lecture halls, auditoriums | learning auditoriums | Large group spaces |
| Practical Spaces | labs, laboratories, workshops | learning labs | Hands-on/practical spaces |
| Study Areas | study halls, study rooms, libraries | learning commons | Collaborative study spaces |
| Computer Rooms | computer labs, IT rooms | digital learning labs | Technology-focused spaces |
| Reception/Front Desk | front desk, reception | welcome center | First point of contact |

### Academic Structures

| Category | NEVER Use | ALWAYS Use | Context Notes |
|----------|-----------|------------|---------------|
| Outcomes | course outcomes, teaching outcomes | learning outcomes | Focus on learner achievement |
| Objectives | teaching objectives, course objectives | learning objectives | Goal-oriented language |
| Content Structure | syllabus, course outline | learning pathway | Journey-based terminology |
| Framework | curriculum, course structure | learning framework | Holistic approach |
| Performance Metrics | grades, marks, scores | learning assessments | Assessment-focused |
| Academic Year | school year, academic year | learning year | Consistent terminology |
| Terms/Semesters | semester, term, quarter | learning period | Time-based divisions |

---

## Highly Encouraged Terms

### Assessment & Evaluation

| Avoid | Preferred | Context Notes |
|-------|-----------|---------------|
| failed, failure, flunked | did not meet learning outcomes, needs additional support | Avoid deficit language |
| passed, pass | achieved learning outcomes, met expectations | Achievement-focused |
| test, exam, examination | learning assessment, assessment | Less stressful terminology |
| homework | independent learning activities | Self-directed emphasis |
| assignment, task | learning task, learning activity | Engagement-focused |
| quiz | quick assessment, check-in assessment | Less formal terminology |
| midterm, final | progress assessment, culminating assessment | Journey-based |
| report card | learning progress report | Growth-focused |
| GPA, grade point average | learning achievement index | Alternative metric naming |

### Behavioral & Disciplinary

| Avoid | Preferred | Context Notes |
|-------|-----------|---------------|
| detention | reflection time, restorative session | Growth-oriented |
| suspension | temporary learning pause | Non-punitive framing |
| expelled, expulsion | learning journey transition | Respectful terminology |
| punishment | consequence, learning opportunity | Educational focus |
| discipline, disciplinary action | behavioral guidance, support intervention | Supportive language |
| bad behavior | behavior needing support | Non-judgmental |
| troublemaker | learner needing additional support | Person-first language |

### Communication & Interaction

| Avoid | Preferred | Context Notes |
|-------|-----------|---------------|
| teach, teaching | facilitate, facilitating learning | Collaborative approach |
| lecture | learning session, guided discussion | Interactive emphasis |
| attendance | learning participation | Engagement-focused |
| absent, absence | non-participation, away | Neutral terminology |
| tardy, late | delayed arrival | Non-judgmental |
| parent-teacher meeting | learning partner conference | Collaborative framing |
| office hours | open consultation time | Accessible terminology |

### Administrative

| Avoid | Preferred | Context Notes |
|-------|-----------|---------------|
| enrollment, enroll | learning journey registration | Journey-based |
| admission | learning community acceptance | Community-focused |
| dropout | learning journey pause | Non-final terminology |
| transfer | learning journey transition | Movement-focused |
| graduation | learning milestone celebration | Achievement celebration |
| diploma, certificate | learning achievement credential | Credential terminology |
| transcript | learning journey record | Documentation |

---

## Recommended Terms

### Technology & Digital

| Traditional | JKKN Preferred | Context Notes |
|-------------|----------------|---------------|
| e-learning | digital learning | Modern terminology |
| online class | virtual learning session | Consistent with session terminology |
| LMS (Learning Management System) | learning platform | Simplified |
| student portal | learner portal | Consistent with learner terminology |
| login credentials | access credentials | Generic |

### Extracurricular

| Traditional | JKKN Preferred | Context Notes |
|-------------|----------------|---------------|
| extracurricular activities | enrichment activities | Value-added framing |
| clubs | interest groups, learning circles | Community-focused |
| sports teams | athletic groups | Consistent terminology |
| field trip | learning expedition | Adventure-focused |
| school event | community event | Inclusive terminology |

---

## Code & Technical Implementation

### Variable/Field Naming Conventions

```
// INCORRECT
studentId, studentName, studentList
teacherId, teacherName, facultyList
classroomId, classroomName
gradeValue, gradeLevel

// CORRECT
learnerId, learnerName, learnerList
facilitatorId, facilitatorName, facilitatorList
learningStudioId, learningStudioName
assessmentValue, learningLevel
```

### Database Schema Naming

```sql
-- INCORRECT
CREATE TABLE students (...)
CREATE TABLE teachers (...)
CREATE TABLE classrooms (...)
CREATE TABLE grades (...)

-- CORRECT
CREATE TABLE learners (...)
CREATE TABLE learning_facilitators (...)
CREATE TABLE learning_studios (...)
CREATE TABLE learning_assessments (...)
```

### API Endpoint Naming

```
// INCORRECT
GET /api/students
POST /api/teachers
GET /api/classrooms/:id
PUT /api/grades/:id

// CORRECT
GET /api/learners
POST /api/learning-facilitators
GET /api/learning-studios/:id
PUT /api/learning-assessments/:id
```

### UI Labels & Messages

```
// INCORRECT
"Student Dashboard"
"Teacher Login"
"Class Schedule"
"Grade Report"
"Student failed the exam"

// CORRECT
"Learner Dashboard"
"Learning Facilitator Login"
"Learning Session Schedule"
"Learning Assessment Report"
"Learner did not meet learning outcomes"
```

---

## Context-Specific Guidelines

### When Interfacing with External Systems
When integrating with external systems that use traditional terminology, maintain JKKN terminology in all user-facing elements while mapping internally.

### Legal/Official Documents
Some official documents may require traditional terminology for legal compliance. In such cases, use traditional terms with JKKN equivalents in parentheses where appropriate.

### Marketing & Communications
All external communications MUST use JKKN terminology consistently to reinforce brand identity.

### Technical Documentation
Internal technical docs should use JKKN terminology to maintain consistency across all touchpoints.

---

## Quick Reference Cheat Sheet

| NEVER Say | ALWAYS Say |
|-----------|------------|
| student | learner |
| teacher | learning facilitator |
| staff | team member |
| classroom | learning studio |
| lecture hall | learning auditorium |
| lab | learning lab |
| study hall | learning commons |
| syllabus | learning pathway |
| curriculum | learning framework |
| grades | learning assessments |
| failed | did not meet learning outcomes |
| passed | achieved learning outcomes |
| test/exam | learning assessment |
| homework | independent learning activities |
| assignment | learning task |
