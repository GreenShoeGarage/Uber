/*
 * UberToothGUI narrow Bluetooth Basic Rate decoder kernel.
 *
 * Algorithmically derived from libbtbb bluetooth_packet.c (GPL-2.0),
 * Great Scott Gadgets / Project Ubertooth contributors.
 * This file intentionally implements only a small browser-safe subset:
 * - Bluetooth access-code generation
 * - exact promiscuous LAP discovery
 * - known-LAP access-code matching with Hamming distance
 * - header-presence screening
 * - clock-six/UAP/basic header candidate decoding
 *
 * It is not a replacement for the complete libbtbb library.
 */
#include <stdint.h>

#define INPUT_BYTES 50
#define SYMBOLS (INPUT_BYTES * 8)

static uint8_t input_buf[INPUT_BYTES];
static uint8_t symbols[SYMBOLS];
static uint8_t candidate_uap[64];
static uint8_t candidate_type[64];
static uint8_t candidate_lt_addr[64];
static uint8_t candidate_flags[64];
static uint8_t candidate_hec[64];
static int last_offset = -1;
static uint32_t last_lap = 0;
static uint8_t last_errors = 0xff;
static uint8_t last_header_present = 0;

static const uint8_t INDICES[64] = {
  99,85,17,50,102,58,108,45,92,62,32,118,88,11,80,2,37,69,55,8,20,40,74,114,15,106,30,78,53,72,28,26,
  68,7,39,113,105,77,71,25,84,49,57,44,61,117,10,1,123,124,22,125,111,23,42,126,6,112,76,24,48,43,116,0
};
static const uint8_t WHITENING_DATA[127] = {
  1,1,1,0,0,0,1,1,1,0,1,1,0,0,0,1,0,1,0,0,1,0,1,1,1,1,1,0,1,0,1,0,1,0,0,0,0,1,0,1,1,0,1,1,1,1,0,0,
  1,1,1,0,0,1,0,1,0,1,1,0,0,1,1,0,0,0,0,0,1,1,0,1,1,0,1,0,1,1,1,0,1,0,0,0,1,1,0,0,1,0,0,0,1,0,0,0,
  0,0,0,1,0,0,1,0,0,1,1,0,1,0,0,0,1,1,1,1,0,1,1,1,0,0,0,0,1,1,1
};
static const uint64_t SW_MATRIX[24] = {
  0xfe000002a0d1c014ULL,0x01000003f0b9201fULL,0x008000033ae40edbULL,0x004000035fca99b9ULL,
  0x002000036d5dd208ULL,0x00100001b6aee904ULL,0x00080000db577482ULL,0x000400006dabba41ULL,
  0x00020002f46d43f4ULL,0x000100017a36a1faULL,0x00008000bd1b50fdULL,0x000040029c3536aaULL,
  0x000020014e1a9b55ULL,0x0000100265b5d37eULL,0x0000080132dae9bfULL,0x000004025bd5ea0bULL,
  0x00000203ef526bd1ULL,0x000001033511ab3cULL,0x000000819a88d59eULL,0x00000040cd446acfULL,
  0x00000022a41aabb3ULL,0x0000001390b5cb0dULL,0x0000000b0ae27b52ULL,0x0000000585713da9ULL
};

#define DEFAULT_CODEWORD 0xb0000002c7820e7eULL

static uint8_t reverse8(uint8_t byte) {
  return ((byte & 0x80) >> 7) | ((byte & 0x40) >> 5) | ((byte & 0x20) >> 3) | ((byte & 0x10) >> 1) |
         ((byte & 0x08) << 1) | ((byte & 0x04) << 3) | ((byte & 0x02) << 5) | ((byte & 0x01) << 7);
}
static uint64_t air_to_host64(const uint8_t *air, int bits) {
  uint64_t v = 0; for (int i=0;i<bits;i++) v |= ((uint64_t)(air[i]&1)) << i; return v;
}
static uint16_t air_to_host16(const uint8_t *air, int bits) {
  uint16_t v = 0; for (int i=0;i<bits;i++) v |= ((uint16_t)(air[i]&1)) << i; return v;
}
static uint8_t air_to_host8(const uint8_t *air, int bits) {
  uint8_t v = 0; for (int i=0;i<bits;i++) v |= ((uint8_t)(air[i]&1)) << i; return v;
}
static uint8_t popcount64(uint64_t v) {
  uint8_t n=0; while(v){v&=(v-1);n++;} return n;
}
static uint64_t gen_syncword(uint32_t lap) {
  uint64_t codeword = DEFAULT_CODEWORD;
  for (int i=0;i<24;i++) if (lap & (0x800000u >> i)) codeword ^= SW_MATRIX[i];
  return codeword;
}
static void unpack(void) {
  for (int i=0;i<INPUT_BYTES;i++) for(int j=0;j<8;j++) symbols[i*8+j] = ((input_buf[i] << j) & 0x80) >> 7;
}
static int find_exact_any(void) {
  for (int off=0; off<=SYMBOLS-64; off++) {
    uint64_t sync = air_to_host64(&symbols[off],64);
    uint32_t lap = (uint32_t)((sync >> 34) & 0xffffffu);
    if (gen_syncword(lap) == sync) { last_lap=lap; last_errors=0; return off; }
  }
  return -1;
}
static int find_known(uint32_t lap, uint8_t max_errors) {
  uint64_t ac = gen_syncword(lap);
  for (int off=0; off<=SYMBOLS-64; off++) {
    uint64_t sync = air_to_host64(&symbols[off],64);
    uint8_t errors = popcount64(sync ^ ac);
    if (errors <= max_errors) { last_lap=lap; last_errors=errors; return off; }
  }
  return -1;
}
static int header_present_at(int offset) {
  if (offset < 0 || offset + 122 > SYMBOLS) return 0;
  const uint8_t *stream = &symbols[offset + 63];
  int be=0; uint8_t msb=stream[0];
  be += stream[1] ^ !msb; be += stream[2] ^ msb; be += stream[3] ^ !msb; be += stream[4] ^ msb;
  stream += 5;
  for(int a=0;a<54;a+=3){int b=a+1,c=a+2;be += ((stream[a]^stream[b]) | (stream[b]^stream[c]) | (stream[c]^stream[a]));}
  return be < 18;
}
static void unfec13(const uint8_t *input, uint8_t *output, int length) {
  for(int i=0;i<length;i++){int a=3*i,b=a+1,c=a+2;output[i]=(input[a]&input[b])|(input[b]&input[c])|(input[c]&input[a]);}
}
static void unwhiten(const uint8_t *input, uint8_t *output, int clock, int length, int skip) {
  int idx = (INDICES[clock & 0x3f] + skip) % 127;
  for(int i=0;i<length;i++){output[i]=input[i]^WHITENING_DATA[idx];idx=(idx+1)%127;}
}
static uint8_t uap_from_hec(uint16_t data, uint8_t hec) {
  for(int i=9;i>=0;i--){if(hec&0x80) hec^=0x65; hec=(uint8_t)((hec<<1)|(((hec>>7)^(data>>i))&1));}
  return reverse8(hec);
}
static void decode_candidates(int offset) {
  if (!header_present_at(offset)) return;
  uint8_t header[18], unwhitened[18];
  const uint8_t *stream=&symbols[offset+68];
  unfec13(stream,header,18);
  for(int clock=0;clock<64;clock++){
    unwhiten(header,unwhitened,clock,18,0);
    uint16_t hdr_data=air_to_host16(unwhitened,10);
    uint8_t hec=air_to_host8(&unwhitened[10],8);
    candidate_uap[clock]=uap_from_hec(hdr_data,hec);
    candidate_lt_addr[clock]=air_to_host8(&unwhitened[0],3);
    candidate_type[clock]=air_to_host8(&unwhitened[3],4);
    candidate_flags[clock]=air_to_host8(&unwhitened[7],3);
    candidate_hec[clock]=hec;
  }
}

__attribute__((visibility("default"))) uint32_t btbb_input_ptr(void){ return (uint32_t)(uintptr_t)input_buf; }
__attribute__((visibility("default"))) uint64_t btbb_gen_syncword(uint32_t lap){ return gen_syncword(lap & 0xffffffu); }
__attribute__((visibility("default"))) int32_t btbb_scan(uint32_t known_lap, uint32_t use_known, uint32_t max_errors){
  unpack(); last_lap=0; last_errors=0xff; last_header_present=0;
  for(int i=0;i<64;i++){candidate_uap[i]=candidate_type[i]=candidate_lt_addr[i]=candidate_flags[i]=candidate_hec[i]=0;}
  last_offset = use_known ? find_known(known_lap & 0xffffffu, (uint8_t)(max_errors>4?4:max_errors)) : find_exact_any();
  if(last_offset>=0){last_header_present=(uint8_t)header_present_at(last_offset); if(last_header_present) decode_candidates(last_offset);}
  return last_offset;
}
__attribute__((visibility("default"))) uint32_t btbb_last_lap(void){return last_lap;}
__attribute__((visibility("default"))) uint32_t btbb_last_errors(void){return last_errors;}
__attribute__((visibility("default"))) uint32_t btbb_header_present(void){return last_header_present;}
__attribute__((visibility("default"))) uint32_t btbb_candidate_uap(uint32_t i){return i<64?candidate_uap[i]:0;}
__attribute__((visibility("default"))) uint32_t btbb_candidate_type(uint32_t i){return i<64?candidate_type[i]:0;}
__attribute__((visibility("default"))) uint32_t btbb_candidate_lt_addr(uint32_t i){return i<64?candidate_lt_addr[i]:0;}
__attribute__((visibility("default"))) uint32_t btbb_candidate_flags(uint32_t i){return i<64?candidate_flags[i]:0;}
__attribute__((visibility("default"))) uint32_t btbb_candidate_hec(uint32_t i){return i<64?candidate_hec[i]:0;}
