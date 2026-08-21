-- Correct transport stop rates to match the approved stop-rates sheet (143 stops).
-- Source: stop-rates-template export reviewed 2026-08-21; the sheet is the pricing authority.
-- Applied to BOTH stop_wise fee structures: Arts Aided and Staff - All Colleges.
-- Both structures held identical amounts before this change, so one old-value guard covers both.
-- Guarded on the current amount: a row already changed by someone else is skipped, not clobbered.
BEGIN;

WITH corrections(stop_id, old_amount, new_amount) AS (VALUES
  -- 01/1 JALAKANDAPURAM SANTHAPETTAI
  ('bb2fb601-4e5c-4149-be07-3631f1623791'::uuid, 20900, 20000),
  -- 01/2 JALAKANDAPURAM MUNIYAPPAN KOVIL
  ('a2d0d150-98c7-4e86-ae27-d54e9bf3f886'::uuid, 7150, 20000),
  -- 06/1 PUTHUR
  ('8d009ab4-76aa-4c48-8c47-63114b661e54'::uuid, 7700, 14000),
  -- 06/2 GURUVUREDIYUR
  ('de62780c-e0d6-4772-b8c9-99508aa3edfc'::uuid, 7700, 14000),
  -- 06/3 ALLAMARAM
  ('db843b2f-6ec6-4065-9c19-8c8faa695e2e'::uuid, 12650, 13800),
  -- 06/11 SINGAMPATTAI GATE
  ('c5ac5f97-530c-41c1-9532-c0bd791c636e'::uuid, 13700, 12600),
  -- 06/12 SINGAMPATTAI HR SEC SCHOOL
  ('ff63d410-4029-43b8-acb5-861c059822be'::uuid, 13700, 12600),
  -- 06/13 KONERIPATTI PIRIVU
  ('854cbed3-2497-4225-bbec-099f779ca0ee'::uuid, 12300, 12600),
  -- 06/19 KUTTAIMUNIYAPPAN KOVIL
  ('793255a6-0019-496e-9c96-13dac29a3306'::uuid, 7150, 9900),
  -- 06/20 COOLIKARAN PALAYAM
  ('319fa74d-db4d-4e67-baa7-b2b953e66daa'::uuid, 7150, 9900),
  -- 06/21 RICE MILL
  ('e1890375-b0ff-41e3-855a-41e6d5956ca3'::uuid, 7150, 9900),
  -- 06/23 URACHIKOOTTAI
  ('de99895b-890c-457b-bdc3-89a665201680'::uuid, 9900, 9350),
  -- 06/24 OBULI MILL
  ('98604411-c66d-4629-bd30-901d4a2f2108'::uuid, 9900, 9350),
  -- 06/27 BHAVANI BUS STAND
  ('07cc64ac-70b8-4647-b892-feb150dd21a8'::uuid, 8250, 5500),
  -- 06/28 KPM PARK
  ('2800a89f-4b67-4b6d-9605-5b6b978c225b'::uuid, 8250, 5500),
  -- 12/1 EADAPPADI
  ('4528ed28-90fb-418c-b3b7-8aa09e88b912'::uuid, 14500, 16500),
  -- 12/2 EADAPPADI BOYS HR SCHOOL
  ('fdfce75a-adcb-4d99-b28f-8ce02919d743'::uuid, 14500, 16500),
  -- 12/3 SATHI THEATER
  ('1ae68b53-bd60-41ac-9b89-c5156156c8d2'::uuid, 14500, 16500),
  -- 12/4 VELLANDI VALASU
  ('6bbee9b0-d768-45c8-b785-fb6f55d9124f'::uuid, 14500, 16500),
  -- 12/15 AMMAN KATTUR
  ('5fe2cc76-0e9f-4730-becf-2c8cc3a29af5'::uuid, 15900, 14500),
  -- 12/16 THANGAYOUR
  ('a06c536a-9126-460d-af9c-0c8c4787d6c8'::uuid, 15900, 10650),
  -- 12/17 VARATHAN KATTANOUR
  ('ce9a3d09-248d-4339-a9ce-fa1c50270d08'::uuid, 12650, 10650),
  -- 12/18 ORUKKAMALAI
  ('607d1939-c355-4f09-adb4-3ab56689abee'::uuid, 12650, 10650),
  -- 12/19 CHINTHAMANI THOTTAM
  ('5c375a1a-bceb-4445-a4d7-096f68b7b5a6'::uuid, 12650, 10650),
  -- 12/20 CHEMICAL PIRIVU
  ('8fb638d1-ae64-450e-9993-88b6fcda8933'::uuid, 8800, 10450),
  -- 12/21 SANGAKARI NEW BUS STAND
  ('b6220847-92a4-42b6-85fb-c5028e44d0a0'::uuid, 8800, 10450),
  -- 12/22 SANGAKARU ASSOCIATION BUNK
  ('61bbac6b-85f7-4bdc-aa99-808141547801'::uuid, 8800, 10450),
  -- 12/23 SANGAKARI OLD BUS STAND
  ('71f0aad7-e541-40d3-bc07-582589d50778'::uuid, 8800, 10450),
  -- 12/28 PACHAMPALAYAM
  ('9397f1e7-d42f-4d0f-96d7-8e4163585a50'::uuid, 16500, 4400),
  -- 14/5 VERILI KATTUR
  ('f80abb34-811d-413e-9d08-93215388cd01'::uuid, 15900, 18900),
  -- 14/6 ACHAN KADU
  ('59ec10ce-41c3-404b-9f0b-68d97ce8c20b'::uuid, 15900, 18900),
  -- 14/7 MASILAPALAYAM
  ('7fb6b98b-da2d-46dc-b3b3-bb6b22fdd063'::uuid, 15900, 18900),
  -- 14/8 KULLA VEERAM PATTI
  ('20996a51-5073-4462-992e-941b34ff072b'::uuid, 15900, 18900),
  -- 14/9 METTUR WORK SHOP
  ('854ce5f3-e91f-473f-9d0a-938a8da52042'::uuid, 15900, 18900),
  -- 14/10 METTUR GH
  ('3be6e42d-59ca-43be-88f8-59ed72d8a731'::uuid, 15900, 18900),
  -- 15/3 SEELANAYAKKAM PATTI BYPASS
  ('69ba8e07-113d-4091-8e55-39fdbbc69b64'::uuid, 10450, 18800),
  -- 15/4 KONDALAMPATTI BYPASS
  ('067a6ea6-d8fa-4297-a263-a865020c9c02'::uuid, 5500, 18600),
  -- 15/5 NEAIKARAPATTI
  ('dfed69d9-55b6-4b49-ac36-3ceec468dd21'::uuid, 5500, 18600),
  -- 16/9 KALLIPATTI PIRIVU
  ('c9c28c7a-6f55-44c0-b55e-e446206e1f9d'::uuid, 12100, 17600),
  -- 16/11 GOBI BUS STAND
  ('4283837a-94cf-4fbe-8ae4-18c700ecb8b7'::uuid, 17600, 16500),
  -- 16/12 JEEVA SET
  ('3b7971f1-648c-4d67-95af-264c011747bf'::uuid, 12900, 15900),
  -- 16/20 KAVUNTHAPADI NAALROAD
  ('4150e612-073c-4915-985f-51d5028586a0'::uuid, 18700, 11000),
  -- 16/24 SEVAGOWNDANOOR
  ('0102da77-f724-484b-99f6-8d7d0be01cae'::uuid, 14500, 8250),
  -- 18/12 KARUR BYPASS
  ('cde9c279-b1eb-40e5-bab9-d3dbb83aed32'::uuid, 5500, 16500),
  -- 20/5 SANTHA PETTAI
  ('5c4bc047-7945-4f39-bc93-8c986b79aafa'::uuid, 20000, 15600),
  -- 20/6 VELLA KATTUR
  ('7dcd881b-d8ce-44a0-bec2-cca3ca1e685e'::uuid, 15900, 15600),
  -- 20/7 REDYPALAYAM
  ('1dbe1668-175f-4aba-b581-2a236a0a9003'::uuid, 15900, 15600),
  -- 20/8 ARUPPU MILL
  ('e55b2ffe-491e-4b35-b121-d91d89e834b4'::uuid, 15900, 13200),
  -- 20/9 VIRALI KATTUIR
  ('1299aa75-0576-412a-b1b6-bc12ae45fd41'::uuid, 15900, 13200),
  -- 20/17 MYLAMPAADI
  ('34c9b59c-9952-4006-aa87-6b7751c18052'::uuid, 12100, 9900),
  -- 20/18 EARAPPANAYAKKAN PALAYAM
  ('cd3c3e0d-d67e-4b03-ae1c-07a7a36e14b2'::uuid, 12100, 9900),
  -- 20/20 OURACHIKOOTAI
  ('8020e69a-77fc-45ff-862d-213b12ff0da1'::uuid, 9350, 7500),
  -- 22/2 KALLUKADAI
  ('bfa4e0d2-f39d-4f2f-83a5-27b23eab4356'::uuid, 25000, 20000),
  -- 22/3 ELLAI PUDHUR
  ('45b6a3b4-3e38-41a0-89ae-400cc1b000d6'::uuid, 25000, 20000),
  -- 22/4 CHITHUR
  ('fc0afadd-58cf-493b-be84-6ce259284784'::uuid, 25000, 20000),
  -- 22/5 POOLAMPATTI HR SEC SCHOOL
  ('0a3bade1-476d-4413-aa17-05e811a2dfce'::uuid, 15900, 17000),
  -- 22/6 PULIYAM PATTI PIRIVU
  ('1ab5515a-74fd-4249-bab5-b395cd574d27'::uuid, 15900, 17000),
  -- 22/7 ONDI PANAI I
  ('c4f88522-bbdd-46ad-9068-0fa802241681'::uuid, 15900, 17000),
  -- 22/8 ONDI PANAI II
  ('c7213446-81a7-41cd-acc6-929c834737fb'::uuid, 15900, 17000),
  -- 22/9 ADAIYUR PIRIVU
  ('ca1d270e-77da-4f0c-bfa7-018ff9d0c126'::uuid, 15900, 17000),
  -- 22/10 SAMAATHI STOPING
  ('b027a177-ea3b-4372-a98d-5f0374a517ae'::uuid, 15900, 17000),
  -- 22/11 PUTHUR
  ('931ecb7d-e2dd-4db4-9818-af4e901a5ec7'::uuid, 7700, 17000),
  -- 22/12 PUTHUR WATER TANK
  ('fa7a9af9-7ca2-4acb-93c1-512f145c3f49'::uuid, 7700, 17000),
  -- 22/13 IRUPPALI PIRIVU
  ('281d1200-3257-4ac4-9f67-15e0d54b48c8'::uuid, 7700, 16500),
  -- 22/14 MOOLAKADAI I
  ('a4cda602-df1c-47d3-a4b1-ec39b0f30c88'::uuid, 21450, 16500),
  -- 22/15 MOOLAKADAI II
  ('90e261db-0d4b-47a4-84e6-bb023f809894'::uuid, 21450, 16500),
  -- 22/16 CHETTIMANKURICI
  ('c645f2fc-d685-4b5c-b6fb-59b489003112'::uuid, 18700, 16500),
  -- 22/17 OTTAPATTI
  ('8273e1d4-53d3-4835-808d-60b2ced9772c'::uuid, 18700, 16500),
  -- 22/18 NACHI PALAYAM
  ('9d3136c8-6df5-44c7-81e3-95e26d283c5e'::uuid, 18700, 16500),
  -- 22/19 ANNA SILAI
  ('91ccb842-0f7e-45a6-8211-d36e0cd8137d'::uuid, 18700, 16500),
  -- 22/20 VELLA NAYAKKAN PALAYAM
  ('35f6fa6e-69fa-4e0a-93ab-5148d0323b10'::uuid, 18700, 16500),
  -- 22/21 AVANIYUR RING ROAD
  ('cd86953a-bc5e-4464-96ad-97cbd2ad056b'::uuid, 18700, 16500),
  -- 22/22 AVANIYUR
  ('cfe3804c-e367-4852-aa57-161f599c912b'::uuid, 18700, 16500),
  -- 22/23 NACHIYUR PIRIVU
  ('5f3f2e0a-af9d-4d84-9c4d-1820b6069c69'::uuid, 18700, 16500),
  -- 22/24 MOOLAPATHAI PIRIVU
  ('3015b5b1-443f-4cd2-8390-369a9f54a712'::uuid, 13200, 16500),
  -- 22/25 EADAPPADI NAAL EOAD
  ('4055efa9-6ec1-4f9d-9083-92464a49ff08'::uuid, 13200, 15100),
  -- 23/15 KAKAPALAYAM
  ('92d76dee-ee4c-45c2-a811-9fb16c281e3d'::uuid, 4400, 15100),
  -- 23/16 MAHUDANJAVADI
  ('a707672b-b16d-4613-98ec-df6c84b8c961'::uuid, 4400, 12100),
  -- 24/3 MECHERI AMMAN KOVIL
  ('794db2dc-1baa-48da-932e-bed461ebad50'::uuid, 10400, 20900),
  -- 24/4 KUTTAPATTI NAAL ROAD
  ('5cc93ebe-15ee-49f1-ab57-a66a09cde8c0'::uuid, 18700, 20900),
  -- 24/7 VANAVASI MUNIYAPPAN KOVIL
  ('6d5427b9-5018-4c0e-9c2f-077d8542ef37'::uuid, 7150, 20900),
  -- 24/8 SOORAPALLI
  ('6a0f6ba3-6fa4-487e-9c1e-4cc779ed35fa'::uuid, 7150, 20900),
  -- 24/9 SANTHI THEATER
  ('a9a60953-384e-4d05-9b61-20f00166af30'::uuid, 7150, 20900),
  -- 24/901 JALAKANDAPURAM SANTHAPETTAI [retired]
  ('98f54588-e46e-440e-bb0d-0869c80d678c'::uuid, 20900, 20000),
  -- 24/902 JALAKANDAPURAM MUNIYAPPAN KOVIL [retired]
  ('b340527d-0939-44ff-91a7-4cfdd34fbe0d'::uuid, 7150, 20000),
  -- 29/2 PACHAMPALAYAM
  ('7d44653e-adfb-4a45-98ee-e650719e5e5a'::uuid, 7150, 27500),
  -- 29/5 ANNA NAGAR
  ('6a09c546-a924-470f-9e69-8489287551b3'::uuid, 9600, 22000),
  -- 29/6 KANAKKAMPALAYAM
  ('9013870e-9ecf-4caf-9925-dedea7a84e7b'::uuid, 10450, 22000),
  -- 29/8 CHENGAPALLI BYPASS
  ('0decb254-54e8-4f19-b12e-929a74779c91'::uuid, 5500, 17800),
  -- 29/9 PALLAGOWNDAMPALAYAM BYPASS
  ('b0139ec5-56ca-448a-8287-8fa72f9ac868'::uuid, 5500, 17800),
  -- 29/10 VIJAYAMANGALAM BYPASS
  ('db91f59e-ae74-4ca2-8da5-f32311f2569e'::uuid, 5500, 17800),
  -- 29/19 VAIKKAL MEDU
  ('fcf23996-ae06-4e76-bbc4-75d49455e547'::uuid, 14500, 8250),
  -- 29/20 VASAVI COLLEGE
  ('c8f22fc9-cede-48f4-afd0-7408648cacde'::uuid, 14500, 8250),
  -- 31/1 DHIMMARATHAM PATTI
  ('7807f7b0-a86f-4c02-ab48-300bf28957ff'::uuid, 22000, 16500),
  -- 31/2 KUMARAMANGALAM
  ('532c69fd-878a-425f-80be-0be25052adfe'::uuid, 22000, 16500),
  -- 31/3 MALAI SUTHI ROAD
  ('2b913e04-2a69-40f1-a9ed-95a71b4403c1'::uuid, 22000, 16500),
  -- 31/4 VALDAR GATE [retired]
  ('209c35b0-834f-477b-8c9f-97b32ae30cee'::uuid, 22000, 16500),
  -- 31/9 KOTTAPLLI
  ('f9394e30-b077-44b0-8799-18db8be82ee5'::uuid, 16500, 14300),
  -- 31/10 THOKKAVAADI
  ('153cc18b-97c9-4cf1-8964-8489613f084e'::uuid, 16500, 12300),
  -- 31/11 VARAPALAYAM
  ('22c51a12-d654-4a05-b6c9-3ddf48ceb58b'::uuid, 14300, 12300),
  -- 31/12 K S R COLLEGE [retired]
  ('660ed8bc-28cb-4fd2-8a71-879b7bc95ea6'::uuid, 14300, 12300),
  -- 31/13 S P K SCHOOL [retired]
  ('63f2bd60-4a68-4a9e-b8d0-0c93cc61b85a'::uuid, 14300, 12300),
  -- 31/14 TAJ NAGAR
  ('34b88e1d-d3ff-45bb-9ec8-ee50c03cf808'::uuid, 14300, 12300),
  -- 31/15 PERUMAL KOVIL [retired]
  ('c847cad9-0679-4e98-b72f-c90450e78b8a'::uuid, 14300, 12300),
  -- 31/16 ANNAI SAKTHIYA NAGAR
  ('0dc144a5-ca0e-4deb-ad4d-646e6237be9a'::uuid, 14300, 12300),
  -- 31/17 AAYAKATTUR [retired]
  ('b499abb8-5f58-4573-8990-5d7b993b5f49'::uuid, 15900, 12300),
  -- 31/18 KAVERI RS
  ('3eccd542-c866-4bb3-ba27-aee51c8e56ab'::uuid, 15900, 12300),
  -- 31/19 VASANTH NAGAR [retired]
  ('f6013be4-e6fa-4564-9eb7-248375859337'::uuid, 15900, 12300),
  -- 31/20 KANNANOOR MARIYAMMAN
  ('296eb24e-9883-448a-9ec2-f65ac8fc7db1'::uuid, 15900, 12300),
  -- 31/21 PETROL BUNK
  ('f998fac7-71c5-4b16-a17c-edd177407901'::uuid, 16500, 12300),
  -- 31/22 KAVERI RS PIRIVU [retired]
  ('359e8075-f653-4197-9f3f-ed4d23bbf043'::uuid, 16500, 12300),
  -- 31/23 BUTHAN SANTHAI [retired]
  ('09d44bb1-7b21-4ef6-9d29-ff9098bcdd4b'::uuid, 16500, 12300),
  -- 31/24 AGRAHARAM [retired]
  ('1aa46790-0f89-4db5-aa5f-ce846889fe1b'::uuid, 13750, 9600),
  -- 31/25 VIJAYALAKSHMI THEATER [retired]
  ('c00e670d-a959-4e57-9a0e-66ef65d6824e'::uuid, 13750, 9600),
  -- 31/26 AAVANTHI PLAYAM [retired]
  ('5403e159-5f35-435a-a94c-33fc95c382ba'::uuid, 8800, 9600),
  -- 31/27 SILLANG KAADU [retired]
  ('4d861465-37b5-4e75-a22c-3a09fbb01efe'::uuid, 8800, 9600),
  -- 31/28 GANAPATHIPALAYAM [retired]
  ('2c6c1703-28cf-4179-bbaa-27846061b2b4'::uuid, 6600, 8800),
  -- 31/29 MANIYAAR [retired]
  ('28fd74c3-e619-4d95-9714-92458203639b'::uuid, 6600, 8800),
  -- 32/1 SANKAGIRI RS
  ('84d9b689-e255-4cd1-86d2-f451b8873034'::uuid, 15400, 18100),
  -- 32/13 VAALRAJA PALAYAM
  ('773e6355-df00-4098-adfd-b2024b8a7fc5'::uuid, 12100, 10400),
  -- 32/14 VAANI SCHOOL
  ('684bf0ad-f04b-4301-9070-cafeda2aaa54'::uuid, 12100, 10400),
  -- 32/15 FON COLLEGE
  ('52bb04b4-579b-4c40-a267-f68a694e2ca8'::uuid, 12100, 10400),
  -- 32/16 MEETTUKADAI
  ('04f76714-5de0-4db3-a3f1-bb8a43c905ee'::uuid, 12100, 6600),
  -- 32/17 VINAGAR KOVIL
  ('04375be1-8645-4f5f-aa63-3ac44a5d20a1'::uuid, 12100, 6600),
  -- 32/20 KOOTTAI MEDU
  ('a493bd06-8ddd-499d-be95-e49719441818'::uuid, 6600, 5500),
  -- 34/3 S P B COLONY
  ('e59df929-8797-4ae0-9488-567c53d6a660'::uuid, 12300, 12900),
  -- 34/6 OTTAMETHAI [retired]
  ('9e1fb94e-08cf-4fb1-b65a-c52d197ba807'::uuid, 8800, 9900),
  -- 34/7 SANTHE PETTAI [retired]
  ('8781a17e-957c-45bd-85cd-c805dd68a672'::uuid, 20000, 9900),
  -- 37/8 METTUPALAYAM
  ('8e2548e4-c795-475f-b087-29b8b66dad5c'::uuid, 11000, 16500),
  -- 37/10 KACHU PALLI
  ('b7025fee-e949-4550-b936-ecb9eccc1ccc'::uuid, 16500, 11000),
  -- 37/11 MOOLAKADAI
  ('40aaae32-07bc-4f82-ac7f-dcc502e7e60d'::uuid, 21450, 11000),
  -- 39/6 THALAVAAI PATTAI
  ('2c31fdee-d324-4efc-a679-94e52196999e'::uuid, 12650, 11800),
  -- 39/7 JAMBAI
  ('1c05c804-f02e-4938-9505-1a69e23ba098'::uuid, 12650, 10450),
  -- 39/8 SERVARAYAN PALAYAM
  ('159af79a-9e4a-4961-8cab-dd517a5bde07'::uuid, 12650, 10450),
  -- 40/7 AALAMARAM
  ('76ef9f72-ddfd-4b0a-b773-f895e398da1f'::uuid, 12650, 16500),
  -- 40/10 BARARTHI NAGAR
  ('deea0404-35ca-45a4-9bf2-c0d195e8db1a'::uuid, 10100, 12100),
  -- 40/13 CHETTIPATTI SANTHAI
  ('7aef19a3-87e9-4806-b945-eefb302b3626'::uuid, 12100, 10450),
  -- 40/14 CHETTIPATTI
  ('ad5a50cd-d60e-4e65-9dbe-fac4acf60308'::uuid, 13200, 10450),
  -- 40/15 CHETTIPATTI PALAM
  ('ae9a7ff8-dede-4cde-8936-78e7a7c44ddc'::uuid, 13200, 10450),
  -- 40/16 ODASAKARAI
  ('cd08aef0-b542-4f27-87d5-5b262e4d5ed2'::uuid, 13200, 10450),
  -- 40/17 KONAKAZATHANOOR
  ('cfaf83f8-3386-4ef6-bf2c-1922abf4b1e6'::uuid, 13200, 10450),
  -- 40/19 THEVUR SANTHAI
  ('a3cbbe7a-b8ee-4e69-9dca-e527a49277cb'::uuid, 11000, 9900),
  -- 40/20 THEVUR
  ('b898690b-8df7-4b88-838c-85ab1e8da4cc'::uuid, 11000, 9300)
)
UPDATE tms_fee_structure_stop_rate r
   SET annual_amount = c.new_amount,
       updated_at    = now()
  FROM corrections c
 WHERE r.stop_id = c.stop_id
   AND r.fee_structure_id IN (
         '9f8f5153-d45a-4fbf-85f2-c399292c201b',  -- Transport Fees 2026-2027 (Arts Aided)
         '1cff2da9-565b-4618-9c21-68fb66c52aad'   -- Transport Fees 2026-2027 (Staff - All Colleges)
       )
   AND r.annual_amount = c.old_amount;

COMMIT;
