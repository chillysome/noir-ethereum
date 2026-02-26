# Noir Library Starter

This is a template for building Noir libraries. It includes a basic example of a Noir library with an example bin circuit and test suite.

 This Starter Template includes:

- A basic library at `lib/`
- Example bin circuit at `examples/lib_example/`
- Tests at `tests/`
- CI Scripts at `scripts/`

---

# LIBRARY_NAME

Add a brief description of the library

## Noir version compatibility

This library is tested to work as of Noir version:

nargo version = 1.0.0-beta.6
noirc version = 1.0.0-beta.6+e796dfd67726cbc28eb9991782533b211025928d

barretenberg version 0.84.0


## Benchmarks

Benchmarks are ignored by `git` and checked on pull-request. As such, benchmarks may be generated
with the following command.

```bash
./scripts/build-gates-report.sh
```

The benchmark will be generated at `./gates_report.json`.

## Profiling

To profile the circuit, run the following command:

```bash
./scripts/profile.sh
```

## Installation

In your _Nargo.toml_ file, add the version of this library you would like to install under dependency:

```toml
[dependencies]
LIBRARY = { tag = "v0.1.0", git = "https://github.com/noir-lang/LIBRARY_NAME" }
```

## `library`

### Usage

`PLACEHOLDER`

## Execution Environment

This project is developed and tested on the following environment:

- **OS**: Linux
- **Shell**: zsh
- **Noir version**: 0.36.0 & 1.0.0-beta.x compatible
- **Node.js**: (Check with `node --version`)
- **Package Manager**: pnpm

### Quick Start

```bash
# Install dependencies
pnpm install

# Build the workspace
nargo compile --workspace

# Run tests
pnpm test

# Build zkcross compliance circuit
cd zkcross/examples/zkcross_compliance
nargo compile
```

## Benchmarks

### Verify Account

```md
Compilation time: 3.91s
Execution time: 1.08s
Prove time: 5.536s
```

### Verify Storage Proof

```md
Compilation time: 2.78s
Execution time: 0.81s
Prove time: 4.402s
```
