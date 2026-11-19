export interface District {
  id: string;
  name: string;
  taluks: Taluk[];
}

export interface Taluk {
  id: string;
  name: string;
}

export interface State {
  id: string;
  name: string;
  districts: District[];
}

// Tamil Nadu - Complete data
const tamilNaduDistricts: District[] = [
  {
    id: 'ariyalur',
    name: 'Ariyalur',
    taluks: [
      { id: 'ariyalur_taluk', name: 'Ariyalur' },
      { id: 'andimadam', name: 'Andimadam' },
      { id: 'sendurai', name: 'Sendurai' }
    ]
  },
  {
    id: 'chengalpattu',
    name: 'Chengalpattu',
    taluks: [
      { id: 'chengalpattu_taluk', name: 'Chengalpattu' },
      { id: 'tambaram', name: 'Tambaram' },
      { id: 'pallavaram', name: 'Pallavaram' },
      { id: 'madurantakam', name: 'Madurantakam' }
    ]
  },
  {
    id: 'chennai',
    name: 'Chennai',
    taluks: [
      { id: 'chennai_north', name: 'Chennai North' },
      { id: 'chennai_south', name: 'Chennai South' },
      { id: 'chennai_central', name: 'Chennai Central' }
    ]
  },
  {
    id: 'coimbatore',
    name: 'Coimbatore',
    taluks: [
      { id: 'coimbatore_north', name: 'Coimbatore North' },
      { id: 'coimbatore_south', name: 'Coimbatore South' },
      { id: 'pollachi', name: 'Pollachi' },
      { id: 'valparai', name: 'Valparai' },
      { id: 'sulur', name: 'Sulur' },
      { id: 'mettupalayam', name: 'Mettupalayam' }
    ]
  },
  {
    id: 'cuddalore',
    name: 'Cuddalore',
    taluks: [
      { id: 'cuddalore_taluk', name: 'Cuddalore' },
      { id: 'panruti', name: 'Panruti' },
      { id: 'vriddachalam', name: 'Vriddachalam' },
      { id: 'chidambaram', name: 'Chidambaram' }
    ]
  },
  {
    id: 'dharmapuri',
    name: 'Dharmapuri',
    taluks: [
      { id: 'dharmapuri_taluk', name: 'Dharmapuri' },
      { id: 'harur', name: 'Harur' },
      { id: 'karimangalam', name: 'Karimangalam' },
      { id: 'palacode', name: 'Palacode' },
      // Added 2026-09-24 (BUG-003746): Dharmapuri has seven taluks, the picker
      // offered four, so learners from the other three could not pick their own.
      { id: 'nallampalli', name: 'Nallampalli' },
      { id: 'pappireddipatti', name: 'Pappireddipatti' },
      { id: 'pennagaram', name: 'Pennagaram' }
    ]
  },
  {
    id: 'dindigul',
    name: 'Dindigul',
    taluks: [
      { id: 'dindigul_taluk', name: 'Dindigul' },
      { id: 'kodaikanal', name: 'Kodaikanal' },
      { id: 'palani', name: 'Palani' },
      { id: 'vedasandur', name: 'Vedasandur' }
    ]
  },
  {
    id: 'erode',
    name: 'Erode',
    taluks: [
      { id: 'erode_taluk', name: 'Erode' },
      { id: 'gobichettipalayam', name: 'Gobichettipalayam' },
      { id: 'sathyamangalam', name: 'Sathyamangalam' },
      { id: 'perundurai', name: 'Perundurai' },
      { id: 'Anthiyur', name: 'Anthiyur' },
      { id: 'bhavani', name: 'Bhavani' },
      { id: 'kodumudi', name: 'Kodumudi' },
      { id: 'modakurichi', name: 'Modakurichi' },
      { id: 'thalavadi', name: 'Thalavadi' },
      { id: 'nambiyur', name: 'Nambiyur' }
    ]
  },
  {
    id: 'kallakurichi',
    name: 'Kallakurichi',
    taluks: [
      { id: 'kallakurichi_taluk', name: 'Kallakurichi' },
      { id: 'chinnaselam', name: 'Chinnaselam' },
      { id: 'ulundurpet', name: 'Ulundurpet' }
    ]
  },
  {
    id: 'kanchipuram',
    name: 'Kanchipuram',
    taluks: [
      { id: 'kanchipuram_taluk', name: 'Kanchipuram' },
      { id: 'sriperumbudur', name: 'Sriperumbudur' },
      { id: 'uthiramerur', name: 'Uthiramerur' },
      { id: 'walajabad', name: 'Walajabad' }
    ]
  },
  {
    id: 'kanyakumari',
    name: 'Kanyakumari',
    taluks: [
      { id: 'agastheeswaram', name: 'Agastheeswaram' },
      { id: 'kalkulam', name: 'Kalkulam' },
      { id: 'vilavancode', name: 'Vilavancode' },
      { id: 'thovalai', name: 'Thovalai' }
    ]
  },
  {
    id: 'karur',
    name: 'Karur',
    taluks: [
      { id: 'karur_taluk', name: 'Karur' },
      { id: 'krishnarayapuram', name: 'Krishnarayapuram' },
      { id: 'kulithalai', name: 'Kulithalai' }
    ]
  },
  {
    id: 'krishnagiri',
    name: 'Krishnagiri',
    taluks: [
      { id: 'krishnagiri_taluk', name: 'Krishnagiri' },
      { id: 'hosur', name: 'Hosur' },
      { id: 'pochampalli', name: 'Pochampalli' },
      { id: 'uthangarai', name: 'Uthangarai' }
    ]
  },
  {
    id: 'madurai',
    name: 'Madurai',
    taluks: [
      { id: 'madurai_north', name: 'Madurai North' },
      { id: 'madurai_south', name: 'Madurai South' },
      { id: 'madurai_east', name: 'Madurai East' },
      { id: 'madurai_west', name: 'Madurai West' },
      { id: 'melur', name: 'Melur' },
      { id: 'vadipatti', name: 'Vadipatti' }
    ]
  },
  {
    id: 'mayiladuthurai',
    name: 'Mayiladuthurai',
    taluks: [
      { id: 'mayiladuthurai_taluk', name: 'Mayiladuthurai' },
      { id: 'sirkali', name: 'Sirkali' },
      { id: 'tharangambadi', name: 'Tharangambadi' }
    ]
  },
  {
    id: 'nagapattinam',
    name: 'Nagapattinam',
    taluks: [
      { id: 'nagapattinam_taluk', name: 'Nagapattinam' },
      { id: 'kilvelur', name: 'Kilvelur' },
      { id: 'vedaranyam', name: 'Vedaranyam' }
    ]
  },
  {
    id: 'namakkal',
    name: 'Namakkal',
    taluks: [
      { id: 'namakkal_taluk', name: 'Namakkal' },
      { id: 'rasipuram', name: 'Rasipuram' },
      { id: 'tiruchengode', name: 'Tiruchengode' },
      { id: 'paramathi_velur', name: 'Paramathi Velur' },
      { id: 'mohanur', name: 'Mohanur' },
      { id: 'kolli_hills', name: 'Kolli Hills' },
      { id: 'senthamangalam', name: 'Senthamangalam' },
      { id: 'kumarapalayam', name: 'Kumarapalayam' }
    ]
  },
  {
    id: 'nilgiris',
    name: 'Nilgiris',
    taluks: [
      { id: 'udhagamandalam', name: 'Udhagamandalam' },
      { id: 'coonoor', name: 'Coonoor' },
      { id: 'kotagiri', name: 'Kotagiri' },
      { id: 'gudalur', name: 'Gudalur' }
    ]
  },
  {
    id: 'perambalur',
    name: 'Perambalur',
    taluks: [
      { id: 'perambalur_taluk', name: 'Perambalur' },
      { id: 'alathur', name: 'Alathur' }
    ]
  },
  {
    id: 'pudukkottai',
    name: 'Pudukkottai',
    taluks: [
      { id: 'pudukkottai_taluk', name: 'Pudukkottai' },
      { id: 'alangudi', name: 'Alangudi' },
      { id: 'aranthangi', name: 'Aranthangi' },
      { id: 'avudayarkoil', name: 'Avudayarkoil' },
      { id: 'gandarvakottai', name: 'Gandarvakottai' },
      { id: 'iluppur', name: 'Iluppur' },
      { id: 'karambakudi', name: 'Karambakudi' },
      { id: 'kulathur', name: 'Kulathur' },
      { id: 'manamelkudi', name: 'Manamelkudi' },
      { id: 'ponnamaravathi', name: 'Ponnamaravathi' },
      { id: 'thirumayam', name: 'Thirumayam' },
      { id: 'viralimalai', name: 'Viralimalai' }
    ]
  },
  {
    id: 'ramanathapuram',
    name: 'Ramanathapuram',
    taluks: [
      { id: 'ramanathapuram_taluk', name: 'Ramanathapuram' },
      { id: 'rameswaram', name: 'Rameswaram' },
      { id: 'mudukulathur', name: 'Mudukulathur' },
      { id: 'paramakudi', name: 'Paramakudi' }
    ]
  },
  {
    id: 'ranipet',
    name: 'Ranipet',
    taluks: [
      { id: 'ranipet_taluk', name: 'Ranipet' },
      { id: 'arakkonam', name: 'Arakkonam' },
      { id: 'arcot', name: 'Arcot' },
      { id: 'walajah', name: 'Walajah' }
    ]
  },
  {
    id: 'salem',
    name: 'Salem',
    taluks: [
      { id: 'salem_taluk', name: 'Salem' },
      { id: 'attur', name: 'Attur' },
      { id: 'edappadi', name: 'Edappadi' },
      { id: 'gangavalli', name: 'Gangavalli' },
      { id: 'kadayampatti', name: 'Kadayampatti' },
      { id: 'mettur', name: 'Mettur' },
      { id: 'omalur', name: 'Omalur' },
      { id: 'pethanayakanpalayam', name: 'Pethanayakanpalayam' },
      { id: 'sankari', name: 'Sankari' },
      { id: 'vazhapadi', name: 'Vazhapadi' },
      { id: 'yercaud', name: 'Yercaud' }
    ]
  },
  {
    id: 'sivaganga',
    name: 'Sivaganga',
    taluks: [
      { id: 'sivaganga_taluk', name: 'Sivaganga' },
      { id: 'devakottai', name: 'Devakottai' },
      { id: 'ilayankudi', name: 'Ilayankudi' },
      { id: 'karaikudi', name: 'Karaikudi' },
      { id: 'manamadurai', name: 'Manamadurai' },
      { id: 'singampunari', name: 'Singampunari' },
      { id: 'tirupathur', name: 'Tirupathur' },
      { id: 'tiruvarangulam', name: 'Tiruvarangulam' }
    ]
  },
  {
    id: 'tenkasi',
    name: 'Tenkasi',
    taluks: [
      { id: 'tenkasi_taluk', name: 'Tenkasi' },
      { id: 'alangulam', name: 'Alangulam' },
      { id: 'kadayanallur', name: 'Kadayanallur' },
      { id: 'veerakeralampudur', name: 'Veerakeralampudur' }
    ]
  },
  {
    id: 'thanjavur',
    name: 'Thanjavur',
    taluks: [
      { id: 'thanjavur_taluk', name: 'Thanjavur' },
      { id: 'kumbakonam', name: 'Kumbakonam' },
      { id: 'papanasam', name: 'Papanasam' },
      { id: 'pattukottai', name: 'Pattukottai' },
      { id: 'peravurani', name: 'Peravurani' },
      { id: 'orathanadu', name: 'Orathanadu' },
      { id: 'thiruvaiyaru', name: 'Thiruvaiyaru' },
      { id: 'thiruvidaimarudur', name: 'Thiruvidaimarudur' }
    ]
  },
  {
    id: 'theni',
    name: 'Theni',
    taluks: [
      { id: 'theni_taluk', name: 'Theni' },
      { id: 'andipatti', name: 'Andipatti' },
      { id: 'bodinayakanur', name: 'Bodinayakanur' },
      { id: 'periyakulam', name: 'Periyakulam' },
      { id: 'uthamapalayam', name: 'Uthamapalayam' }
    ]
  },
  {
    id: 'thoothukudi',
    name: 'Thoothukudi',
    taluks: [
      { id: 'thoothukudi_taluk', name: 'Thoothukudi' },
      { id: 'ettayapuram', name: 'Ettayapuram' },
      { id: 'kayathar', name: 'Kayathar' },
      { id: 'kovilpatti', name: 'Kovilpatti' },
      { id: 'ottapidaram', name: 'Ottapidaram' },
      { id: 'sattankulam', name: 'Sattankulam' },
      { id: 'srivaikuntam', name: 'Srivaikuntam' },
      { id: 'tiruchendur', name: 'Tiruchendur' },
      { id: 'vilathikulam', name: 'Vilathikulam' }
    ]
  },
  {
    id: 'tiruchirappalli',
    name: 'Tiruchirappalli',
    taluks: [
      { id: 'tiruchirappalli_taluk', name: 'Tiruchirappalli' },
      { id: 'lalgudi', name: 'Lalgudi' },
      { id: 'manachanallur', name: 'Manachanallur' },
      { id: 'manapparai', name: 'Manapparai' },
      { id: 'musiri', name: 'Musiri' },
      { id: 'srirangam', name: 'Srirangam' },
      { id: 'thottiyam', name: 'Thottiyam' },
      { id: 'thiruverumbur', name: 'Thiruverumbur' }
    ]
  },
  {
    id: 'tirunelveli',
    name: 'Tirunelveli',
    taluks: [
      { id: 'tirunelveli_taluk', name: 'Tirunelveli' },
      { id: 'ambasamudram', name: 'Ambasamudram' },
      { id: 'cheranmahadevi', name: 'Cheranmahadevi' },
      { id: 'manur', name: 'Manur' },
      { id: 'nanguneri', name: 'Nanguneri' },
      { id: 'palayamkottai', name: 'Palayamkottai' },
      { id: 'radhapuram', name: 'Radhapuram' },
      { id: 'thisayanvilai', name: 'Thisayanvilai' }
    ]
  },
  {
    id: 'tirupathur',
    name: 'Tirupathur',
    taluks: [
      { id: 'tirupathur_taluk', name: 'Tirupathur' },
      { id: 'ambur', name: 'Ambur' },
      { id: 'natrampalli', name: 'Natrampalli' },
      { id: 'vaniyambadi', name: 'Vaniyambadi' }
    ]
  },
  {
    id: 'tiruppur',
    name: 'Tiruppur',
    taluks: [
      { id: 'tiruppur_taluk', name: 'Tiruppur' },
      { id: 'avinashi', name: 'Avinashi' },
      { id: 'dharapuram', name: 'Dharapuram' },
      { id: 'kangeyam', name: 'Kangeyam' },
      { id: 'madathukulam', name: 'Madathukulam' },
      { id: 'palladam', name: 'Palladam' },
      { id: 'udumalaipettai', name: 'Udumalaipettai' }
    ]
  },
  {
    id: 'tiruvallur',
    name: 'Tiruvallur',
    taluks: [
      { id: 'tiruvallur_taluk', name: 'Tiruvallur' },
      { id: 'avadi', name: 'Avadi' },
      { id: 'gummidipoondi', name: 'Gummidipoondi' },
      { id: 'ponneri', name: 'Ponneri' },
      { id: 'poonamallee', name: 'Poonamallee' },
      { id: 'red_hills', name: 'Red Hills' },
      { id: 'tiruttani', name: 'Tiruttani' },
      { id: 'uthukkottai', name: 'Uthukkottai' }
    ]
  },
  {
    id: 'tiruvannamalai',
    name: 'Tiruvannamalai',
    taluks: [
      { id: 'tiruvannamalai_taluk', name: 'Tiruvannamalai' },
      { id: 'arani', name: 'Arani' },
      { id: 'chengam', name: 'Chengam' },
      { id: 'chetpet', name: 'Chetpet' },
      { id: 'cheyyar', name: 'Cheyyar' },
      { id: 'jamunamarathur', name: 'Jamunamarathur' },
      { id: 'kalasapakkam', name: 'Kalasapakkam' },
      { id: 'kilpennathur', name: 'Kilpennathur' },
      { id: 'polur', name: 'Polur' },
      { id: 'thandramet', name: 'Thandramet' },
      { id: 'vandavasi', name: 'Vandavasi' },
      { id: 'vembakkam', name: 'Vembakkam' }
    ]
  },
  {
    id: 'tiruvarur',
    name: 'Tiruvarur',
    taluks: [
      { id: 'tiruvarur_taluk', name: 'Tiruvarur' },
      { id: 'kodavasal', name: 'Kodavasal' },
      { id: 'koothanallur', name: 'Koothanallur' },
      { id: 'mannargudi', name: 'Mannargudi' },
      { id: 'nannilam', name: 'Nannilam' },
      { id: 'needamangalam', name: 'Needamangalam' },
      { id: 'thiruthuraipoondi', name: 'Thiruthuraipoondi' },
      { id: 'valangaiman', name: 'Valangaiman' }
    ]
  },
  {
    id: 'vellore',
    name: 'Vellore',
    taluks: [
      { id: 'vellore_taluk', name: 'Vellore' },
      { id: 'adukkamparai', name: 'Adukkamparai' },
      { id: 'anaicut', name: 'Anaicut' },
      { id: 'gudiyatham', name: 'Gudiyatham' },
      { id: 'katpadi', name: 'Katpadi' },
      { id: 'kaveripakkam', name: 'Kaveripakkam' },
      { id: 'nemili', name: 'Nemili' },
      { id: 'pernambut', name: 'Pernambut' }
    ]
  },
  {
    id: 'viluppuram',
    name: 'Viluppuram',
    taluks: [
      { id: 'viluppuram_taluk', name: 'Viluppuram' },
      { id: 'gingee', name: 'Gingee' },
      { id: 'kandachipuram', name: 'Kandachipuram' },
      { id: 'marakkanam', name: 'Marakkanam' },
      { id: 'melmalaiyanur', name: 'Melmalaiyanur' },
      { id: 'olakkur', name: 'Olakkur' },
      { id: 'rishivandinam', name: 'Rishivandinam' },
      { id: 'sankarapuram', name: 'Sankarapuram' },
      { id: 'thiruvennainallur', name: 'Thiruvennainallur' },
      { id: 'tindivanam', name: 'Tindivanam' },
      { id: 'vanur', name: 'Vanur' },
      { id: 'vikravandi', name: 'Vikravandi' }
    ]
  },
  {
    id: 'virudhunagar',
    name: 'Virudhunagar',
    taluks: [
      { id: 'virudhunagar_taluk', name: 'Virudhunagar' },
      { id: 'aruppukkottai', name: 'Aruppukkottai' },
      { id: 'kariyapatti', name: 'Kariyapatti' },
      { id: 'rajapalayam', name: 'Rajapalayam' },
      { id: 'sathur', name: 'Sathur' },
      { id: 'sivakasi', name: 'Sivakasi' },
      { id: 'tiruchuli', name: 'Tiruchuli' },
      { id: 'vembakottai', name: 'Vembakottai' },
      { id: 'watrap', name: 'Watrap' }
    ]
  }
];

// Other states - Minimal data (2 districts each)
const otherStatesData: State[] = [
  {
    id: 'andhra_pradesh',
    name: 'Andhra Pradesh',
    districts: [
      {
        id: 'visakhapatnam',
        name: 'Visakhapatnam',
        taluks: [
          { id: 'visakhapatnam_urban', name: 'Visakhapatnam Urban' },
          { id: 'visakhapatnam_rural', name: 'Visakhapatnam Rural' }
        ]
      },
      {
        id: 'vijayawada',
        name: 'Vijayawada',
        taluks: [
          { id: 'vijayawada_urban', name: 'Vijayawada Urban' },
          { id: 'vijayawada_rural', name: 'Vijayawada Rural' }
        ]
      }
    ]
  },
  {
    id: 'telangana',
    name: 'Telangana',
    districts: [
      {
        id: 'hyderabad',
        name: 'Hyderabad',
        taluks: [
          { id: 'hyderabad_central', name: 'Hyderabad Central' },
          { id: 'hyderabad_south', name: 'Hyderabad South' }
        ]
      },
      {
        id: 'warangal',
        name: 'Warangal',
        taluks: [
          { id: 'warangal_urban', name: 'Warangal Urban' },
          { id: 'warangal_rural', name: 'Warangal Rural' }
        ]
      }
    ]
  },
  {
    id: 'karnataka',
    name: 'Karnataka',
    districts: [
      {
        id: 'bangalore',
        name: 'Bangalore',
        taluks: [
          { id: 'bangalore_north', name: 'Bangalore North' },
          { id: 'bangalore_south', name: 'Bangalore South' }
        ]
      },
      {
        id: 'mysore',
        name: 'Mysore',
        taluks: [
          { id: 'mysore_urban', name: 'Mysore Urban' },
          { id: 'mysore_rural', name: 'Mysore Rural' }
        ]
      },
      // Added 2026-08-28: a real staff member lives here (pincode 571313) and
      // the district was unmappable, which would have forced the operator to
      // overwrite a correct address to satisfy the now-required picker.
      {
        id: 'chamarajanagar',
        name: 'Chamarajanagar',
        taluks: [
          { id: 'chamarajanagar_taluk', name: 'Chamarajanagar' },
          { id: 'gundlupet', name: 'Gundlupet' },
          { id: 'kollegal', name: 'Kollegal' },
          { id: 'yelandur', name: 'Yelandur' }
        ]
      }
    ]
  },
  {
    id: 'kerala',
    name: 'Kerala',
    districts: [
      {
        id: 'thiruvananthapuram',
        name: 'Thiruvananthapuram',
        taluks: [
          { id: 'thiruvananthapuram_urban', name: 'Thiruvananthapuram Urban' },
          { id: 'thiruvananthapuram_rural', name: 'Thiruvananthapuram Rural' },
          // Added 2026-09-24 (BUG-003982): the real taluks. Urban/Rural above
          // are kept because existing rows store them.
          { id: 'thiruvananthapuram_taluk', name: 'Thiruvananthapuram' },
          { id: 'chirayinkeezhu', name: 'Chirayinkeezhu' },
          { id: 'kattakada', name: 'Kattakada' },
          { id: 'nedumangad', name: 'Nedumangad' },
          { id: 'neyyattinkara', name: 'Neyyattinkara' },
          { id: 'varkala', name: 'Varkala' }
        ]
      },
      // Kochi is a city, not a district (it lies in Ernakulam). Kept only
      // because existing learner rows store it — it was one of two Kerala
      // options until 2026-09-24, so Kerala learners picked it by default.
      {
        id: 'kochi',
        name: 'Kochi',
        taluks: [
          { id: 'kochi_urban', name: 'Kochi Urban' },
          { id: 'kochi_rural', name: 'Kochi Rural' }
        ]
      },
      // Added 2026-08-28, same reason as Chamarajanagar: a real staff address
      // (pincode 686021) that the dataset could not represent.
      {
        id: 'kottayam',
        name: 'Kottayam',
        taluks: [
          { id: 'kottayam_taluk', name: 'Kottayam' },
          { id: 'changanassery', name: 'Changanassery' },
          { id: 'kanjirappally', name: 'Kanjirappally' },
          { id: 'meenachil', name: 'Meenachil' },
          { id: 'vaikom', name: 'Vaikom' }
        ]
      },
      // Added 2026-09-24 (BUG-003982, BUG-003020): Kerala has 14 districts and
      // the picker offered three, so e.g. a Thrissur learner could not enter
      // their own district. Taluk ids that already exist in another state get a
      // district suffix, because id lookups search every state.
      {
        id: 'kollam',
        name: 'Kollam',
        taluks: [
          { id: 'kollam_taluk', name: 'Kollam' },
          { id: 'karunagappally', name: 'Karunagappally' },
          { id: 'kottarakkara', name: 'Kottarakkara' },
          { id: 'kunnathur', name: 'Kunnathur' },
          { id: 'pathanapuram', name: 'Pathanapuram' },
          { id: 'punalur', name: 'Punalur' }
        ]
      },
      {
        id: 'pathanamthitta',
        name: 'Pathanamthitta',
        taluks: [
          { id: 'adoor', name: 'Adoor' },
          { id: 'konni', name: 'Konni' },
          { id: 'kozhencherry', name: 'Kozhencherry' },
          { id: 'mallappally', name: 'Mallappally' },
          { id: 'ranni', name: 'Ranni' },
          { id: 'thiruvalla', name: 'Thiruvalla' }
        ]
      },
      {
        id: 'alappuzha',
        name: 'Alappuzha',
        taluks: [
          { id: 'ambalappuzha', name: 'Ambalappuzha' },
          { id: 'chengannur', name: 'Chengannur' },
          { id: 'cherthala', name: 'Cherthala' },
          { id: 'karthikappally', name: 'Karthikappally' },
          { id: 'kuttanad', name: 'Kuttanad' },
          { id: 'mavelikkara', name: 'Mavelikkara' }
        ]
      },
      {
        id: 'idukki',
        name: 'Idukki',
        taluks: [
          { id: 'devikulam', name: 'Devikulam' },
          { id: 'idukki_taluk', name: 'Idukki' },
          { id: 'peerumade', name: 'Peerumade' },
          { id: 'thodupuzha', name: 'Thodupuzha' },
          { id: 'udumbanchola', name: 'Udumbanchola' }
        ]
      },
      {
        id: 'ernakulam',
        name: 'Ernakulam',
        taluks: [
          { id: 'aluva', name: 'Aluva' },
          { id: 'kanayannur', name: 'Kanayannur' },
          { id: 'kochi_taluk', name: 'Kochi' },
          { id: 'kothamangalam', name: 'Kothamangalam' },
          { id: 'kunnathunad', name: 'Kunnathunad' },
          { id: 'muvattupuzha', name: 'Muvattupuzha' },
          { id: 'north_paravur', name: 'North Paravur' }
        ]
      },
      {
        id: 'thrissur',
        name: 'Thrissur',
        taluks: [
          { id: 'thrissur_taluk', name: 'Thrissur' },
          { id: 'chalakudy', name: 'Chalakudy' },
          { id: 'chavakkad', name: 'Chavakkad' },
          { id: 'kodungallur', name: 'Kodungallur' },
          { id: 'kunnamkulam', name: 'Kunnamkulam' },
          { id: 'mukundapuram', name: 'Mukundapuram' },
          { id: 'thalappilly', name: 'Thalappilly' }
        ]
      },
      {
        id: 'palakkad',
        name: 'Palakkad',
        taluks: [
          { id: 'palakkad_taluk', name: 'Palakkad' },
          { id: 'alathur_palakkad', name: 'Alathur' },
          { id: 'attappady', name: 'Attappady' },
          { id: 'chittur', name: 'Chittur' },
          { id: 'mannarkkad', name: 'Mannarkkad' },
          { id: 'ottapalam', name: 'Ottapalam' },
          { id: 'pattambi', name: 'Pattambi' }
        ]
      },
      {
        id: 'malappuram',
        name: 'Malappuram',
        taluks: [
          { id: 'ernad', name: 'Ernad' },
          { id: 'kondotty', name: 'Kondotty' },
          { id: 'nilambur', name: 'Nilambur' },
          { id: 'perinthalmanna', name: 'Perinthalmanna' },
          { id: 'ponnani', name: 'Ponnani' },
          { id: 'tirur', name: 'Tirur' },
          { id: 'tirurangadi', name: 'Tirurangadi' }
        ]
      },
      {
        id: 'kozhikode',
        name: 'Kozhikode',
        taluks: [
          { id: 'kozhikode_taluk', name: 'Kozhikode' },
          { id: 'koyilandy', name: 'Koyilandy' },
          { id: 'thamarassery', name: 'Thamarassery' },
          { id: 'vadakara', name: 'Vadakara' }
        ]
      },
      {
        id: 'wayanad',
        name: 'Wayanad',
        taluks: [
          { id: 'mananthavady', name: 'Mananthavady' },
          { id: 'sulthan_bathery', name: 'Sulthan Bathery' },
          { id: 'vythiri', name: 'Vythiri' }
        ]
      },
      {
        id: 'kannur',
        name: 'Kannur',
        taluks: [
          { id: 'kannur_taluk', name: 'Kannur' },
          { id: 'iritty', name: 'Iritty' },
          { id: 'payyanur', name: 'Payyanur' },
          { id: 'taliparamba', name: 'Taliparamba' },
          { id: 'thalassery', name: 'Thalassery' }
        ]
      },
      {
        id: 'kasaragod',
        name: 'Kasaragod',
        taluks: [
          { id: 'kasaragod_taluk', name: 'Kasaragod' },
          { id: 'hosdurg', name: 'Hosdurg' },
          { id: 'manjeshwaram', name: 'Manjeshwaram' },
          { id: 'vellarikundu', name: 'Vellarikundu' }
        ]
      }
    ]
  }
];

// All Indian states
export const indianStates: State[] = [
  {
    id: 'tamil_nadu',
    name: 'Tamil Nadu',
    districts: tamilNaduDistricts
  },
  ...otherStatesData,
  // Add other states with minimal data
  {
    id: 'maharashtra',
    name: 'Maharashtra',
    districts: [
      {
        id: 'mumbai',
        name: 'Mumbai',
        taluks: [
          { id: 'mumbai_city', name: 'Mumbai City' },
          { id: 'mumbai_suburban', name: 'Mumbai Suburban' }
        ]
      },
      {
        id: 'pune',
        name: 'Pune',
        taluks: [
          { id: 'pune_city', name: 'Pune City' },
          { id: 'pune_rural', name: 'Pune Rural' }
        ]
      }
    ]
  },
  {
    id: 'gujarat',
    name: 'Gujarat',
    districts: [
      {
        id: 'ahmedabad',
        name: 'Ahmedabad',
        taluks: [
          { id: 'ahmedabad_city', name: 'Ahmedabad City' },
          { id: 'ahmedabad_rural', name: 'Ahmedabad Rural' }
        ]
      },
      {
        id: 'surat',
        name: 'Surat',
        taluks: [
          { id: 'surat_city', name: 'Surat City' },
          { id: 'surat_rural', name: 'Surat Rural' }
        ]
      }
    ]
  },
  {
    id: 'rajasthan',
    name: 'Rajasthan',
    districts: [
      {
        id: 'jaipur',
        name: 'Jaipur',
        taluks: [
          { id: 'jaipur_city', name: 'Jaipur City' },
          { id: 'jaipur_rural', name: 'Jaipur Rural' }
        ]
      },
      {
        id: 'udaipur',
        name: 'Udaipur',
        taluks: [
          { id: 'udaipur_city', name: 'Udaipur City' },
          { id: 'udaipur_rural', name: 'Udaipur Rural' }
        ]
      }
    ]
  },
  {
    id: 'west_bengal',
    name: 'West Bengal',
    districts: [
      {
        id: 'kolkata',
        name: 'Kolkata',
        taluks: [
          { id: 'kolkata_north', name: 'Kolkata North' },
          { id: 'kolkata_south', name: 'Kolkata South' }
        ]
      },
      {
        id: 'howrah',
        name: 'Howrah',
        taluks: [
          { id: 'howrah_urban', name: 'Howrah Urban' },
          { id: 'howrah_rural', name: 'Howrah Rural' }
        ]
      }
    ]
  },
  {
    id: 'uttar_pradesh',
    name: 'Uttar Pradesh',
    districts: [
      {
        id: 'lucknow',
        name: 'Lucknow',
        taluks: [
          { id: 'lucknow_urban', name: 'Lucknow Urban' },
          { id: 'lucknow_rural', name: 'Lucknow Rural' }
        ]
      },
      {
        id: 'kanpur',
        name: 'Kanpur',
        taluks: [
          { id: 'kanpur_urban', name: 'Kanpur Urban' },
          { id: 'kanpur_rural', name: 'Kanpur Rural' }
        ]
      }
    ]
  },
  {
    id: 'bihar',
    name: 'Bihar',
    districts: [
      {
        id: 'patna',
        name: 'Patna',
        taluks: [
          { id: 'patna_urban', name: 'Patna Urban' },
          { id: 'patna_rural', name: 'Patna Rural' }
        ]
      },
      {
        id: 'gaya',
        name: 'Gaya',
        taluks: [
          { id: 'gaya_urban', name: 'Gaya Urban' },
          { id: 'gaya_rural', name: 'Gaya Rural' }
        ]
      }
    ]
  },
  {
    id: 'madhya_pradesh',
    name: 'Madhya Pradesh',
    districts: [
      {
        id: 'bhopal',
        name: 'Bhopal',
        taluks: [
          { id: 'bhopal_urban', name: 'Bhopal Urban' },
          { id: 'bhopal_rural', name: 'Bhopal Rural' }
        ]
      },
      {
        id: 'indore',
        name: 'Indore',
        taluks: [
          { id: 'indore_urban', name: 'Indore Urban' },
          { id: 'indore_rural', name: 'Indore Rural' }
        ]
      }
    ]
  },
  {
    id: 'odisha',
    name: 'Odisha',
    districts: [
      {
        id: 'bhubaneswar',
        name: 'Bhubaneswar',
        taluks: [
          { id: 'bhubaneswar_urban', name: 'Bhubaneswar Urban' },
          { id: 'bhubaneswar_rural', name: 'Bhubaneswar Rural' }
        ]
      },
      {
        id: 'cuttack',
        name: 'Cuttack',
        taluks: [
          { id: 'cuttack_urban', name: 'Cuttack Urban' },
          { id: 'cuttack_rural', name: 'Cuttack Rural' }
        ]
      }
    ]
  },
  {
    id: 'punjab',
    name: 'Punjab',
    districts: [
      {
        id: 'chandigarh',
        name: 'Chandigarh',
        taluks: [
          { id: 'chandigarh_urban', name: 'Chandigarh Urban' },
          { id: 'chandigarh_rural', name: 'Chandigarh Rural' }
        ]
      },
      {
        id: 'ludhiana',
        name: 'Ludhiana',
        taluks: [
          { id: 'ludhiana_urban', name: 'Ludhiana Urban' },
          { id: 'ludhiana_rural', name: 'Ludhiana Rural' }
        ]
      }
    ]
  }
];

// Helper functions
export const getStateById = (stateId: string): State | undefined => {
  return indianStates.find((state) => state.id === stateId);
};

export const getDistrictsByState = (stateId: string): District[] => {
  const state = getStateById(stateId);
  return state ? state.districts : [];
};

export const getTaluksByDistrict = (
  stateId: string,
  districtId: string
): Taluk[] => {
  const districts = getDistrictsByState(stateId);
  const district = districts.find((d) => d.id === districtId);
  return district ? district.taluks : [];
};

/**
 * Resolve a stored permanent_address_* value to its dropdown ID.
 *
 * Two storage formats coexist in production for these columns:
 *   (a) legacy / admission-form rows store the display NAME, often
 *       uppercase (e.g. 'TAMIL NADU', 'SALEM', 'METTUR');
 *   (b) QR-student-form rows store the snake_case ID directly
 *       (e.g. 'tamil_nadu', 'salem', 'mettur').
 *
 * Both edit surfaces (enquiry form, QR student form) bind ID-based
 * <Select>s, so a raw name never matches an option and the field renders
 * blank. This resolver tries an ID match first (cheap, unambiguous) then
 * falls back to a case-insensitive NAME match. Returns '' when nothing
 * matches so the caller can safely default.
 */
export const getLocationIdByName = (
  name: string | undefined | null,
  type: 'state' | 'district' | 'taluk',
  stateId?: string,
): string => {
  if (!name) return '';
  try {
    const normalized = name.trim().toLowerCase();

    if (type === 'state') {
      const byId = indianStates.find((s) => s.id.toLowerCase() === normalized);
      if (byId) return byId.id;
      const byName = indianStates.find((s) => s.name.toLowerCase() === normalized);
      return byName?.id ?? '';
    }

    if (type === 'district') {
      for (const state of indianStates) {
        const byId = getDistrictsByState(state.id).find((d) => d.id.toLowerCase() === normalized);
        if (byId) return byId.id;
      }
      for (const state of indianStates) {
        const byName = getDistrictsByState(state.id).find((d) => d.name.toLowerCase() === normalized);
        if (byName) return byName.id;
      }
      return '';
    }

    // taluk
    const search = (sid: string): string | undefined => {
      const districts = getDistrictsByState(sid);
      for (const district of districts) {
        const byId = getTaluksByDistrict(sid, district.id).find((t) => t.id.toLowerCase() === normalized);
        if (byId) return byId.id;
      }
      for (const district of districts) {
        const byName = getTaluksByDistrict(sid, district.id).find((t) => t.name.toLowerCase() === normalized);
        if (byName) return byName.id;
      }
      return undefined;
    };

    if (stateId) {
      const hit = search(stateId);
      if (hit) return hit;
    } else {
      for (const state of indianStates) {
        const hit = search(state.id);
        if (hit) return hit;
      }
    }
    return '';
  } catch (error) {
    console.error('[locations] getLocationIdByName failed:', error, { name, type, stateId });
    return '';
  }
};

/**
 * Name/id -> picker id, PASSING AN UNRECOGNISED VALUE STRAIGHT THROUGH.
 *
 * Use this — not getLocationIdByName — whenever the value comes out of a
 * database column that predates the picker.
 *
 * getLocationIdByName returns '' for anything not in the dataset. Feed that to
 * a combobox and the field renders EMPTY, and if the field is required the
 * operator's only way to save an unrelated edit is to pick a different value —
 * silently destroying a correct address. That is not hypothetical: it happened
 * to learner taluks (a learner whose taluk was KANAGAGRI, absent from Salem's
 * list, could not be saved without overwriting it).
 *
 * Returning the raw value instead means the combobox can render it verbatim
 * via `options.find(...)?.name || field.value`, so unknown data stays visible
 * and intact until someone deliberately changes it.
 */
export const resolveLocationId = (
  name: string | undefined | null,
  type: 'state' | 'district' | 'taluk',
  stateId?: string
): string => {
  if (!name) return '';
  return getLocationIdByName(name, type, stateId) || name;
};

/**
 * Name -> picker id, ignoring case, spaces, underscores and punctuation.
 *
 * getLocationIdByName only folds case, so 'TAMILNADU' — the single most common
 * legacy spelling in the staff table — matches neither the id 'tamil_nadu' nor
 * the name 'Tamil Nadu' and comes back empty.
 *
 * Use this for INPUT that a human typed (bulk-edit sheets, imports), where the
 * intent is unambiguous and the canonical spelling is written back. Do NOT use
 * it to decide that two stored values are the same record: squashing whitespace
 * is exactly what collapsed 'NOT 219' and 'NOT219' — two different people — in
 * the staff-ID work. That risk does not apply to state and district names,
 * whose dataset has no space-only distinctions.
 */
export const getLocationIdByFuzzyName = (
  name: string | undefined | null,
  type: 'state' | 'district',
  stateId?: string
): string => {
  if (!name) return '';
  const squash = (v: string) => v.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const target = squash(name);
  if (!target) return '';

  if (type === 'state') {
    return (
      indianStates.find((s) => squash(s.id) === target || squash(s.name) === target)?.id ?? ''
    );
  }

  const statesToSearch = stateId
    ? indianStates.filter((s) => s.id === stateId)
    : indianStates;

  for (const state of statesToSearch) {
    const hit = getDistrictsByState(state.id).find(
      (d) => squash(d.id) === target || squash(d.name) === target
    );
    if (hit) return hit.id;
  }
  return '';
};

/**
 * Picker id -> display name, passing an unrecognised id straight through.
 * The mirror of resolveLocationId, for the save direction and for labels.
 */
export const getLocationDisplayName = (
  id: string | undefined | null,
  type: 'state' | 'district',
  stateId?: string
): string => {
  if (!id) return '';
  if (type === 'state') {
    return indianStates.find((s) => s.id === id)?.name ?? id;
  }
  if (stateId) {
    return getDistrictsByState(stateId).find((d) => d.id === id)?.name ?? id;
  }
  for (const state of indianStates) {
    const hit = getDistrictsByState(state.id).find((d) => d.id === id);
    if (hit) return hit.name;
  }
  return id;
};
