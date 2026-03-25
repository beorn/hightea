# Form / FormField

Layout wrappers for form inputs. Form provides vertical grouping. FormField provides label, error display, and consistent spacing between fields.

## Import

```tsx
import { Form, FormField } from "silvery"
```

## Form Props

| Prop       | Type         | Default      | Description                                    |
| ---------- | ------------ | ------------ | ---------------------------------------------- |
| `children` | `ReactNode`  | **required** | Form children (typically FormField components) |
| `onSubmit` | `() => void` | --           | Called when Enter is pressed within the form   |
| `gap`      | `number`     | `1`          | Gap between form fields                        |

## FormField Props

| Prop          | Type        | Default      | Description                              |
| ------------- | ----------- | ------------ | ---------------------------------------- |
| `children`    | `ReactNode` | **required** | Field input children                     |
| `label`       | `string`    | **required** | Field label text                         |
| `error`       | `string`    | --           | Error message to display below the input |
| `description` | `string`    | --           | Description text below the label         |
| `required`    | `boolean`   | --           | Shows `*` indicator after label          |

## Usage

```tsx
<Form onSubmit={handleSubmit}>
  <FormField label="Name" error={errors.name} required>
    <TextInput value={name} onChange={setName} />
  </FormField>
  <FormField label="Email" description="Your work email">
    <TextInput value={email} onChange={setEmail} />
  </FormField>
</Form>
```

## See Also

- [TextInput](./TextInput.md) -- single-line text input
- [Toggle](./Toggle.md) -- checkbox-style toggle
- [Button](./Button.md) -- submit button
